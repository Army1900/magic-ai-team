import { Command } from "commander";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { runUpFlow } from "./up";
import { loadTeamConfig } from "../core/config";
import { checkTargetCompatibility } from "../core/compatibility";
import { assessGateFindings } from "../core/gates";
import { evaluatePolicies } from "../core/policy";
import { exportTeam, validateExportResult, writeExportManifest } from "../core/exporters";
import { appendWorklogEvent } from "../core/worklog";
import { buildHandoffPackage, writeHandoffPackage } from "../core/handoff";
import { EXPORT_TARGET_HELP, normalizeExportTarget } from "../core/targets";
import { commandExists, launchTool, resolveToolSpec } from "../core/launchers";
import { banner, error, info, kv, status, success, warn } from "../core/ui";
import { reportCommandFailure } from "../core/command-errors";
import { failurePayload, successPayload, toJsonString } from "../core/json-output";

async function confirmStart(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  const answer = (await rl.question(`${message} [y/N]: `)).trim().toLowerCase();
  rl.close();
  return answer === "y" || answer === "yes";
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
    .option("--yes", "skip start confirmation", false)
    .option("--json", "json output mode", false)
    .action(async (options) => {
      try {
        const upResult = await runUpFlow({
          name: options.name,
          goal: options.goal,
          target: options.target,
          nonInteractive: Boolean(options.nonInteractive),
          task: options.task,
          strict: Boolean(options.strict),
          verbose: Boolean(options.verbose)
        });
        if (!upResult.ok || !upResult.team_file || !upResult.team_slug) {
          if (options.json) {
            console.log(toJsonString(failurePayload({ blocked_by: "up" })));
          }
          process.exitCode = 1;
          return;
        }

        const target = normalizeExportTarget(options.target ?? upResult.target ?? "claude");
        const projectPath = String(options.project ?? ".");
        const strict = Boolean(options.strict);
        const strictTarget = Boolean(options.strictTarget);
        const team = loadTeamConfig(upResult.team_file);

        const policy = evaluatePolicies(team);
        const policyGate = assessGateFindings(policy.findings, strict);
        if (policyGate.blocked) {
          if (options.json) {
            console.log(
              toJsonString(
                failurePayload({
                  blocked_by: "policy",
                  team_file: upResult.team_file,
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
                  team_file: upResult.team_file,
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
          process.exitCode = 1;
          return;
        }

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
                  team_file: upResult.team_file,
                  target,
                  findings: targetValidation.findings
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
          process.exitCode = 1;
          return;
        }

        const manifest = writeExportManifest(projectPath, exported, upResult.team_file);
        const handoff = buildHandoffPackage(team, target);
        const handoffPaths = writeHandoffPackage(projectPath, handoff);
        appendWorklogEvent(projectPath, {
          type: "handoff",
          team: team.team.name,
          status: "ok",
          note: `handoff generated for ${target}`,
          meta: {
            team_file: upResult.team_file,
            target,
            handoff_paths: handoffPaths
          }
        });

        let started = false;
        let startExitCode: number | null = null;
        const shouldStart = Boolean(options.start);
        if (shouldStart) {
          const toolSpec = resolveToolSpec(target, options.toolCmd ? String(options.toolCmd) : undefined);
          if (!options.yes) {
            const ok = await confirmStart(`Start team in ${projectPath} using ${toolSpec.command}?`);
            if (!ok) {
              warn("Start skipped by user confirmation.");
            } else if (!commandExists(toolSpec.command)) {
              warn(`Tool command not found: ${toolSpec.command}`);
              info(`Use --tool-cmd to override. Example: openteam go --project ${projectPath} --tool-cmd "claude"`);
            } else {
              const execution = launchTool(toolSpec, {
                cwd: projectPath,
                runMode: Boolean(options.run),
                prompt: handoff.prompt
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
                  run_mode: Boolean(options.run)
                }
              });
            }
          } else if (!commandExists(toolSpec.command)) {
            warn(`Tool command not found: ${toolSpec.command}`);
          } else {
            const execution = launchTool(toolSpec, {
              cwd: projectPath,
              runMode: Boolean(options.run),
              prompt: handoff.prompt
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
                run_mode: Boolean(options.run)
              }
            });
          }
        }

        const payload = successPayload({
          team_slug: upResult.team_slug,
          team_file: upResult.team_file,
          target,
          project: projectPath,
          manifest,
          handoff_paths: handoffPaths,
          started,
          start_exit_code: startExitCode
        });
        if (options.json) {
          console.log(toJsonString(payload));
          return;
        }

        banner("Go Complete", target);
        kv("team_slug", upResult.team_slug);
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
        reportCommandFailure({
          error: e,
          errorFn: error,
          infoFn: info,
          nextHint: "Next: try `openteam go --non-interactive --target claude --project <path>` for fastest recovery."
        });
      }
    });
}

