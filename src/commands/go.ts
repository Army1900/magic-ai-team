import { Command } from "commander";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { runUpFlow, UpFlowResult } from "./up";
import { loadTeamConfig } from "../core/config";
import { checkTargetCompatibility } from "../core/compatibility";
import { assessGateFindings } from "../core/gates";
import { evaluatePolicies } from "../core/policy";
import { exportTeam, validateExportResult, writeExportManifest } from "../core/exporters";
import { appendWorklogEvent } from "../core/worklog";
import { buildHandoffPackage, writeHandoffPackage } from "../core/handoff";
import { EXPORT_TARGET_HELP, normalizeExportTarget } from "../core/targets";
import { assertRunModeSupported, commandExists, getLauncherHealth, launchTool, resolveToolSpec } from "../core/launchers";
import { banner, error, info, kv, status, success, warn } from "../core/ui";
import { reportCommandFailure, toErrorMessage } from "../core/command-errors";
import { failurePayload, successPayload, toJsonString } from "../core/json-output";
import { initGoRecovery, loadGoRecovery, saveGoRecovery } from "../core/go-recovery";

async function confirmStart(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  const answer = (await rl.question(`${message} [y/N]: `)).trim().toLowerCase();
  rl.close();
  return answer === "y" || answer === "yes";
}

function hasCliFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

export function registerGoCommand(program: Command): void {
  program
    .command("go")
    .description("One-command flow: up -> export -> handoff -> start")
    .option("--name <name>", "team name")
    .option("--goal <goal>", "team goal")
    .option("--target <target>", EXPORT_TARGET_HELP, "claude")
    .option("--project <path>", "target project path", ".")
    .option("--non-interactive", "use defaults/arguments without guided questions", false)
    .option("--task <text>", "sample task", "Draft an initial delivery plan")
    .option("--strict", "block on warnings in policy/compatibility", false)
    .option("--strict-target", "block on target validation warnings", false)
    .option("--verbose", "show detailed output", false)
    .option("--tool-cmd <command>", "override launch command, e.g. \"claude\"")
    .option("--run", "attempt one-shot run by piping START_PROMPT to tool stdin", false)
    .option("--no-start", "do not launch target tool after handoff")
    .option("--resume", "resume last failed/incomplete go flow from recovery checkpoint", false)
    .option("--yes", "skip start confirmation", false)
    .option("--json", "json output mode", false)
    .action(async (options) => {
      let recoveryPath = "";
      let recovery = loadGoRecovery();
      try {
        const resumeMode = Boolean(options.resume);
        const targetInput =
          resumeMode && recovery && !hasCliFlag("--target")
            ? recovery.options.target
            : options.target ?? recovery?.options.target ?? "claude";
        const projectInput =
          resumeMode && recovery && !hasCliFlag("--project")
            ? recovery.options.project
            : options.project ?? recovery?.options.project ?? ".";
        const runInput =
          resumeMode && !hasCliFlag("--run")
            ? false
            : Boolean(options.run);
        const shouldStartInput =
          resumeMode && recovery && !hasCliFlag("--no-start")
            ? recovery.options.should_start
            : Boolean(options.start);

        const target = normalizeExportTarget(targetInput);
        const projectPath = String(projectInput);
        const strict = Boolean(options.strict);
        const strictTarget = Boolean(options.strictTarget);
        const shouldStart = options.json ? false : shouldStartInput;
        const autoYes = options.json ? true : Boolean(options.yes);

        if (Boolean(options.resume)) {
          if (!recovery || recovery.status === "completed") {
            throw new Error("No resumable go checkpoint found. Run `openteam go` first.");
          }
        } else {
          recovery = initGoRecovery({
            target,
            project: projectPath,
            run: runInput,
            should_start: shouldStart
          });
          recoveryPath = saveGoRecovery(recovery);
        }
        if (!recovery) {
          throw new Error("Failed to initialize go recovery state.");
        }
        recoveryPath = recoveryPath || saveGoRecovery(recovery);
        assertRunModeSupported(target, runInput);

        let upResult: UpFlowResult = {
          ok: true,
          team_file: recovery.artifacts.team_file,
          team_slug: recovery.artifacts.team_slug,
          target
        };
        if (!recovery.artifacts.team_file || !recovery.artifacts.team_slug) {
          upResult = await runUpFlow({
            name: options.name,
            goal: options.goal,
            target,
            nonInteractive: options.json ? true : Boolean(options.nonInteractive),
            task: options.task,
            strict: Boolean(options.strict),
            verbose: Boolean(options.verbose),
            silent: Boolean(options.json)
          });
          if (!upResult.ok || !upResult.team_file || !upResult.team_slug) {
            recovery.status = "failed";
            recovery.phase = "up";
            recovery.last_error = "up failed";
            saveGoRecovery(recovery);
            if (options.json) {
              console.log(toJsonString(failurePayload({ blocked_by: "up", recovery: recoveryPath })));
            }
            process.exitCode = 1;
            return;
          }
          recovery.phase = "export";
          recovery.artifacts.team_file = upResult.team_file;
          recovery.artifacts.team_slug = upResult.team_slug;
          saveGoRecovery(recovery);
        }

        const team = loadTeamConfig(String(upResult.team_file));
        const preflight = shouldStart
          ? getLauncherHealth(target, options.toolCmd ? String(options.toolCmd) : undefined)
          : null;
        if (preflight && !preflight.available && !options.json) {
          warn(`Launcher precheck: command not found for ${target} -> ${preflight.command}`);
          info("Start phase may be skipped unless you install the tool or pass --tool-cmd.");
        }

        const policy = evaluatePolicies(team);
        const policyGate = assessGateFindings(policy.findings, strict);
        if (policyGate.blocked) {
          if (options.json) {
            console.log(
              toJsonString(
                failurePayload({
                  blocked_by: "policy",
                  team_file: String(upResult.team_file),
                  findings: policy.findings
                })
              )
            );
            process.exitCode = 1;
            return;
          }
          error("Go blocked by policy gate before export.");
          for (const finding of policy.findings) {
            status(finding.severity, finding.code, finding.message);
          }
          recovery.status = "failed";
          recovery.phase = "export";
          recovery.last_error = "policy gate blocked";
          saveGoRecovery(recovery);
          process.exitCode = 1;
          return;
        }

        const compatibility = checkTargetCompatibility(team, target);
        const compatGate = assessGateFindings(compatibility.findings, strict);
        if (compatGate.blocked) {
          if (options.json) {
            console.log(
              toJsonString(
                failurePayload({
                  blocked_by: "compatibility",
                  team_file: String(upResult.team_file),
                  target,
                  findings: compatibility.findings
                })
              )
            );
            process.exitCode = 1;
            return;
          }
          error(`Go blocked by ${target} compatibility gate before export.`);
          for (const finding of compatibility.findings) {
            status(finding.severity, finding.code, finding.message);
          }
          recovery.status = "failed";
          recovery.phase = "export";
          recovery.last_error = "compatibility gate blocked";
          saveGoRecovery(recovery);
          process.exitCode = 1;
          return;
        }

        let manifest: string = recovery.artifacts.manifest ?? "";
        if (!manifest) {
          const exported = exportTeam(team, target, projectPath);
          exported.warnings.push(...compatGate.warns.map((w) => `[${w.code}] ${w.message}`));
          const targetValidation = validateExportResult(exported);
          const targetGate = assessGateFindings(targetValidation.findings, strictTarget);
          if (targetGate.blocked) {
            if (options.json) {
              console.log(
                toJsonString(
                  failurePayload({
                    blocked_by: "target_validation",
                    team_file: String(upResult.team_file),
                    target,
                    findings: targetValidation.findings,
                    recovery: recoveryPath
                  })
                )
              );
              process.exitCode = 1;
              return;
            }
            error(`Go blocked by ${target} target validation.`);
            for (const finding of targetValidation.findings) {
              status(finding.severity, finding.code, finding.message);
            }
            recovery.status = "failed";
            recovery.phase = "export";
            recovery.last_error = "target validation blocked";
            saveGoRecovery(recovery);
            process.exitCode = 1;
            return;
          }

          manifest = writeExportManifest(projectPath, exported, String(upResult.team_file));
          recovery.phase = "handoff";
          recovery.artifacts.manifest = manifest;
          saveGoRecovery(recovery);
        }

        let handoffPaths = recovery.artifacts.handoff_brief
          ? {
              root: "",
              brief: recovery.artifacts.handoff_brief,
              prompt: "",
              meta: ""
            }
          : null;
        if (!handoffPaths) {
          const handoff = buildHandoffPackage(team, target);
          handoffPaths = writeHandoffPackage(projectPath, handoff);
          appendWorklogEvent(projectPath, {
            type: "handoff",
            team: team.team.name,
            status: "ok",
            note: `handoff generated for ${target}`,
            meta: {
              team_file: String(upResult.team_file),
              target,
              handoff_paths: handoffPaths
            }
          });
          recovery.phase = "start";
          recovery.artifacts.handoff_brief = handoffPaths.brief;
          saveGoRecovery(recovery);
        }

        let started = false;
        let startExitCode: number | null = recovery.artifacts.start_exit_code ?? null;
        if (shouldStart) {
          const toolSpec = resolveToolSpec(target, options.toolCmd ? String(options.toolCmd) : undefined);
          if (!autoYes) {
            const ok = await confirmStart(`Start team in ${projectPath} using ${toolSpec.command}?`);
            if (!ok) {
              warn("Start skipped by user confirmation.");
            } else if (!commandExists(toolSpec.command)) {
              warn(`Tool command not found: ${toolSpec.command}`);
              info(`Use --tool-cmd to override. Example: openteam go --project ${projectPath} --tool-cmd "claude"`);
            } else {
              const execution = launchTool(toolSpec, {
                cwd: projectPath,
                runMode: runInput,
                prompt: buildHandoffPackage(team, target).prompt
              });
              if (execution.error) {
                throw execution.error;
              }
              started = execution.status === 0;
              startExitCode = execution.status ?? null;
              appendWorklogEvent(projectPath, {
                type: "start",
                team: team.team.name,
                status: started ? "ok" : "fail",
                note: started ? `team started in ${target}` : `team start failed in ${target}`,
                meta: {
                  target,
                  exit_code: execution.status,
                  run_mode: runInput
                }
              });
              recovery.artifacts.start_exit_code = startExitCode;
              saveGoRecovery(recovery);
            }
          } else if (!commandExists(toolSpec.command)) {
            warn(`Tool command not found: ${toolSpec.command}`);
          } else {
            const execution = launchTool(toolSpec, {
              cwd: projectPath,
              runMode: runInput,
              prompt: buildHandoffPackage(team, target).prompt
            });
            if (execution.error) {
              throw execution.error;
            }
            started = execution.status === 0;
            startExitCode = execution.status ?? null;
            appendWorklogEvent(projectPath, {
              type: "start",
              team: team.team.name,
              status: started ? "ok" : "fail",
              note: started ? `team started in ${target}` : `team start failed in ${target}`,
              meta: {
                target,
                exit_code: execution.status,
                run_mode: runInput
              }
            });
            recovery.artifacts.start_exit_code = startExitCode;
            saveGoRecovery(recovery);
          }
        }

        recovery.status = "completed";
        saveGoRecovery(recovery);

        const payload = successPayload({
          team_slug: String(upResult.team_slug),
          team_file: String(upResult.team_file),
          target,
          project: projectPath,
          launcher: preflight,
          manifest,
          handoff_paths: handoffPaths ?? undefined,
          started,
          start_exit_code: startExitCode,
          recovery: recoveryPath
        });
        if (options.json) {
          console.log(toJsonString(payload));
          return;
        }

        banner("Go Complete", target);
        kv("team_slug", String(upResult.team_slug));
        kv("project", projectPath);
        kv("manifest", manifest);
        kv("handoff", handoffPaths.brief);
        if (shouldStart) {
          kv("started", started);
          if (startExitCode !== null) {
            kv("start_exit_code", startExitCode);
          }
        } else {
          info("Start skipped by --no-start.");
          info(`Next: openteam start --project ${projectPath}`);
        }
        info(`Monitor: openteam monitor report --project ${projectPath} --since 24h --write`);
        success("Go flow finished.");
      } catch (e) {
        if (recovery) {
          recovery.status = "failed";
          recovery.last_error = toErrorMessage(e);
          saveGoRecovery(recovery);
        }
        if (options.json) {
          console.log(
            toJsonString(
              failurePayload({
                blocked_by: "go",
                error: toErrorMessage(e),
                recovery: recoveryPath || undefined
              })
            )
          );
          process.exitCode = 1;
          return;
        }
        reportCommandFailure({
          error: e,
          errorFn: error,
          infoFn: info,
          nextHint: "Next: try `openteam go --non-interactive --target claude --project <path>` for fastest recovery."
        });
      }
    });
}
