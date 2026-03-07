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
import {
  commandExists,
  executeRunExecutionPlan,
  getLauncherHealth,
  launchTool,
  resolveRunExecutionPlan,
  resolveToolSpec
} from "../core/launchers";
import { banner, error, info, kv, status, success, warn } from "../core/ui";
import { reportCommandFailure, toErrorMessage } from "../core/command-errors";
import { failurePayload, successPayload, toJsonString } from "../core/json-output";
import { initGoRecovery, loadGoRecoveryAsync, saveGoRecoveryAsync } from "../core/go-recovery";
import { runExportSelfCheck } from "../core/export-selfcheck";
import { applyHighRiskOverride, evaluateTeamQuality } from "../core/team-quality";

async function confirmStart(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  const answer = (await rl.question(`${message} [y/N]: `)).trim().toLowerCase();
  rl.close();
  return answer === "y" || answer === "yes";
}

function hasCliFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

type GoPhase = "up" | "export" | "handoff" | "start";
type PhaseState = "queued" | "running" | "done" | "fallback" | "failed";
interface GoPhaseEvent {
  phase: GoPhase;
  state: PhaseState;
  ts: string;
  elapsed_ms?: number;
  detail?: string;
}

function phaseStatusKind(state: PhaseState): "ok" | "warn" | "fail" {
  if (state === "done") return "ok";
  if (state === "failed") return "fail";
  return "warn";
}

export function registerGoCommand(program: Command): void {
  program
    .command("go")
    .description("One-command flow: up -> export -> handoff -> start")
    .option("--name <name>", "team name")
    .option("--goal <goal>", "team goal")
    .option("--force", "overwrite existing team when name/slug already exists", false)
    .option("--allow-mock", "allow mock fallback when AI auth is unavailable", false)
    .option("--ai-turns <n>", "interactive AI clarification turns for discovery", "2")
    .option("--target <target>", EXPORT_TARGET_HELP, "claude")
    .option("--project <path>", "target project path", ".")
    .option("--non-interactive", "use defaults/arguments without guided questions", false)
    .option("--task <text>", "sample task", "Draft an initial delivery plan")
    .option("--strict", "block on warnings in policy/compatibility", false)
    .option("--strict-target", "block on target validation warnings", false)
    .option("--ignore-high-risk", "do not block high-risk findings from quality audit", false)
    .option("--verbose", "show detailed output", false)
    .option("--tool-cmd <command>", "override launch command, e.g. \"claude\"")
    .option("--run", "attempt one-shot run by piping START_PROMPT to tool stdin", false)
    .option("--no-start", "do not launch target tool after handoff")
    .option("--resume", "resume last failed/incomplete go flow from recovery checkpoint", false)
    .option("--yes", "skip start confirmation", false)
    .option("--json", "json output mode", false)
    .action(async (options) => {
      let phaseTimeline: GoPhaseEvent[] = [];
      let recoveryPath = "";
      let recovery = await loadGoRecoveryAsync();
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
        const ignoreHighRisk = Boolean(options.ignoreHighRisk);
        const shouldStart = options.json ? false : shouldStartInput;
        const autoYes = options.json ? true : Boolean(options.yes);
        const phaseOrder: GoPhase[] = ["up", "export", "handoff", "start"];
        const phaseStartedAt = new Map<GoPhase, number>();
        phaseTimeline = [];
        const markPhase = (phase: GoPhase, state: PhaseState, detail?: string): void => {
          const now = Date.now();
          if (state === "running") {
            phaseStartedAt.set(phase, now);
          }
          const start = phaseStartedAt.get(phase);
          const elapsedMs = start && state !== "running" ? now - start : undefined;
          phaseTimeline.push({
            phase,
            state,
            ts: new Date(now).toISOString(),
            elapsed_ms: elapsedMs,
            detail
          });
          if (!options.json) {
            const elapsed = elapsedMs !== undefined ? ` elapsed=${elapsedMs}ms` : "";
            status(phaseStatusKind(state), `phase:${phase}`, `${state}${elapsed}${detail ? ` | ${detail}` : ""}`);
          }
        };
        for (const phase of phaseOrder) {
          markPhase(phase, "queued");
        }

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
          recoveryPath = await saveGoRecoveryAsync(recovery);
        }
        if (!recovery) {
          throw new Error("Failed to initialize go recovery state.");
        }
        recoveryPath = recoveryPath || (await saveGoRecoveryAsync(recovery));
        const runPlanForGo = runInput
          ? resolveRunExecutionPlan({
              target,
              tool: resolveToolSpec(target, options.toolCmd ? String(options.toolCmd) : undefined),
              prompt: "",
              promptFile: "",
              projectPath
            })
          : null;
        if (runInput && !runPlanForGo?.supported) {
          throw new Error(runPlanForGo?.reason ?? `Target '${target}' cannot run in --run mode.`);
        }

        let upResult: UpFlowResult = {
          ok: true,
          team_file: recovery.artifacts.team_file,
          team_slug: recovery.artifacts.team_slug,
          target
        };
        if (!recovery.artifacts.team_file || !recovery.artifacts.team_slug) {
          markPhase("up", "running");
          upResult = await runUpFlow({
            name: options.name,
            goal: options.goal,
            target,
            force: Boolean(options.force),
            allowMock: Boolean(options.allowMock),
            aiTurns: Number(options.aiTurns ?? 2),
            nonInteractive: options.json ? true : Boolean(options.nonInteractive),
            task: options.task,
            strict: Boolean(options.strict),
            verbose: Boolean(options.verbose),
            silent: Boolean(options.json)
          });
          if (!upResult.ok || !upResult.team_file || !upResult.team_slug) {
            markPhase("up", "failed", "up flow failed");
            recovery.status = "failed";
            recovery.phase = "up";
            recovery.last_error = "up failed";
            await saveGoRecoveryAsync(recovery);
            if (options.json) {
              console.log(toJsonString(failurePayload({ blocked_by: "up", recovery: recoveryPath, phase_timeline: phaseTimeline })));
            }
            process.exitCode = 1;
            return;
          }
          markPhase("up", "done", `team=${upResult.team_slug}`);
          recovery.phase = "export";
          recovery.artifacts.team_file = upResult.team_file;
          recovery.artifacts.team_slug = upResult.team_slug;
          await saveGoRecoveryAsync(recovery);
        } else {
          markPhase("up", "fallback", "resumed from checkpoint");
        }
        const effectiveTarget = upResult.target ?? target;
        recovery.options.target = effectiveTarget;
        await saveGoRecoveryAsync(recovery);

        const team = loadTeamConfig(String(upResult.team_file));
        const quality = evaluateTeamQuality(team, { projectPath, includeScanners: true });
        const qualityFindings = applyHighRiskOverride(quality.findings, ignoreHighRisk);
        const qualityFails = qualityFindings.filter((f) => f.severity === "fail");
        if (qualityFails.length > 0) {
          markPhase("export", "failed", "team quality gate blocked");
          if (options.json) {
            console.log(
              toJsonString(
                failurePayload({
                  blocked_by: "team_quality",
                  team_file: String(upResult.team_file),
                  target: effectiveTarget,
                  quality: { ...quality, findings: qualityFindings },
                  phase_timeline: phaseTimeline,
                  recovery: recoveryPath
                })
              )
            );
            process.exitCode = 1;
            return;
          }
          error("Go blocked by team quality gate before export.");
          for (const finding of qualityFindings) {
            status(finding.severity, finding.code, finding.message);
          }
          recovery.status = "failed";
          recovery.phase = "export";
          recovery.last_error = "team quality gate blocked";
          await saveGoRecoveryAsync(recovery);
          process.exitCode = 1;
          return;
        }
        if (!options.json) {
          for (const finding of qualityFindings) {
            if (finding.severity === "warn") {
              status("warn", finding.code, finding.message);
            }
          }
          for (const scanner of quality.scanner_summary) {
            status(scanner.status === "warn" ? "warn" : "ok", `scanner:${scanner.tool}`, scanner.detail);
          }
        }
        const handoffPackage = buildHandoffPackage(team, effectiveTarget);
        const preflight = shouldStart
          ? getLauncherHealth(effectiveTarget, options.toolCmd ? String(options.toolCmd) : undefined)
          : null;
        if (preflight && !preflight.available && !options.json) {
          warn(`Launcher precheck: command not found for ${effectiveTarget} -> ${preflight.command}`);
          info("Start phase may be skipped unless you install the tool or pass --tool-cmd.");
        }

        const policy = evaluatePolicies(team);
        const policyGate = assessGateFindings(policy.findings, strict);
        if (policyGate.blocked) {
          markPhase("export", "failed", "policy gate blocked");
          if (options.json) {
            console.log(
              toJsonString(
                failurePayload({
                  blocked_by: "policy",
                  team_file: String(upResult.team_file),
                  findings: policy.findings,
                  phase_timeline: phaseTimeline
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
          await saveGoRecoveryAsync(recovery);
          process.exitCode = 1;
          return;
        }

        const compatibility = checkTargetCompatibility(team, effectiveTarget);
        const compatGate = assessGateFindings(compatibility.findings, strict);
        if (compatGate.blocked) {
          markPhase("export", "failed", "compatibility gate blocked");
          if (options.json) {
            console.log(
              toJsonString(
                failurePayload({
                  blocked_by: "compatibility",
                  team_file: String(upResult.team_file),
                  target: effectiveTarget,
                  findings: compatibility.findings,
                  phase_timeline: phaseTimeline
                })
              )
            );
            process.exitCode = 1;
            return;
          }
          error(`Go blocked by ${effectiveTarget} compatibility gate before export.`);
          for (const finding of compatibility.findings) {
            status(finding.severity, finding.code, finding.message);
          }
          recovery.status = "failed";
          recovery.phase = "export";
          recovery.last_error = "compatibility gate blocked";
          await saveGoRecoveryAsync(recovery);
          process.exitCode = 1;
          return;
        }

        let manifest: string = recovery.artifacts.manifest ?? "";
        if (!manifest) {
          markPhase("export", "running");
          const exported = exportTeam(team, effectiveTarget, projectPath);
          exported.warnings.push(...compatGate.warns.map((w) => `[${w.code}] ${w.message}`));
          const targetValidation = validateExportResult(exported);
          const targetGate = assessGateFindings(targetValidation.findings, strictTarget);
          if (targetGate.blocked) {
            markPhase("export", "failed", "target validation blocked");
            if (options.json) {
              console.log(
                toJsonString(
                failurePayload({
                  blocked_by: "target_validation",
                  team_file: String(upResult.team_file),
                  target: effectiveTarget,
                  findings: targetValidation.findings,
                  recovery: recoveryPath,
                  phase_timeline: phaseTimeline
                })
              )
            );
              process.exitCode = 1;
              return;
            }
            error(`Go blocked by ${effectiveTarget} target validation.`);
            for (const finding of targetValidation.findings) {
              status(finding.severity, finding.code, finding.message);
            }
            recovery.status = "failed";
            recovery.phase = "export";
            recovery.last_error = "target validation blocked";
            await saveGoRecoveryAsync(recovery);
            process.exitCode = 1;
            return;
          }

          const selfCheck = runExportSelfCheck(exported, effectiveTarget);
          if (!selfCheck.ok) {
            if (options.json) {
              console.log(
                toJsonString(
                failurePayload({
                  blocked_by: "export_self_check",
                  team_file: String(upResult.team_file),
                  target: effectiveTarget,
                  findings: selfCheck.findings,
                  recovery: recoveryPath,
                  phase_timeline: phaseTimeline
                })
              )
            );
              process.exitCode = 1;
              return;
            }
            error(`Go blocked by ${effectiveTarget} export self-check.`);
            for (const finding of selfCheck.findings) {
              status(finding.severity === "ok" ? "ok" : finding.severity, finding.code, finding.message);
            }
            markPhase("export", "failed", "self-check failed");
            recovery.status = "failed";
            recovery.phase = "export";
            recovery.last_error = "export self-check blocked";
            await saveGoRecoveryAsync(recovery);
            process.exitCode = 1;
            return;
          }

          manifest = writeExportManifest(projectPath, exported, String(upResult.team_file));
          markPhase("export", "done", `target=${effectiveTarget}`);
          recovery.phase = "handoff";
          recovery.artifacts.manifest = manifest;
          await saveGoRecoveryAsync(recovery);
        } else {
          markPhase("export", "fallback", "resumed from checkpoint");
        }

        let handoffPaths = recovery.artifacts.handoff_brief
          ? {
              root: "",
              brief: recovery.artifacts.handoff_brief,
              prompt: recovery.artifacts.handoff_prompt ?? "",
              meta: ""
            }
          : null;
        if (!handoffPaths) {
          markPhase("handoff", "running");
          handoffPaths = writeHandoffPackage(projectPath, handoffPackage);
          appendWorklogEvent(projectPath, {
            type: "handoff",
            team: team.team.name,
            status: "ok",
            note: `handoff generated for ${effectiveTarget}`,
            meta: {
              team_file: String(upResult.team_file),
              target: effectiveTarget,
              handoff_paths: handoffPaths
            }
          });
          recovery.phase = "start";
          recovery.artifacts.handoff_brief = handoffPaths.brief;
          recovery.artifacts.handoff_prompt = handoffPaths.prompt;
          await saveGoRecoveryAsync(recovery);
          markPhase("handoff", "done");
        } else {
          markPhase("handoff", "fallback", "resumed from checkpoint");
        }

        let started = false;
        let startExitCode: number | null = recovery.artifacts.start_exit_code ?? null;
        if (shouldStart) {
          markPhase("start", "running");
          const toolSpec = resolveToolSpec(effectiveTarget, options.toolCmd ? String(options.toolCmd) : undefined);
          const runPlan = runInput
            ? resolveRunExecutionPlan({
                target: effectiveTarget,
                tool: toolSpec,
                prompt: handoffPackage.prompt,
                promptFile: handoffPaths.prompt,
                projectPath
              })
            : null;
          if (!autoYes) {
            const ok = await confirmStart(`Start team in ${projectPath} using ${toolSpec.command}?`);
            if (!ok) {
              warn("Start skipped by user confirmation.");
              markPhase("start", "fallback", "skipped by confirmation");
            } else if (!commandExists(toolSpec.command)) {
              warn(`Tool command not found: ${toolSpec.command}`);
              info(`Use --tool-cmd to override. Example: openteam go --project ${projectPath} --tool-cmd "claude"`);
              markPhase("start", "fallback", "launcher missing");
            } else {
              const execution = runInput
                ? executeRunExecutionPlan(
                    runPlan ?? {
                      supported: false,
                      strategy: "manual",
                      command: toolSpec.command,
                      args: toolSpec.args,
                      prompt: "",
                      reason: "run plan missing"
                    },
                    projectPath
                  )
                : launchTool(toolSpec, {
                    cwd: projectPath,
                    runMode: false,
                    prompt: handoffPackage.prompt
                  });
              const executed = await execution;
              if (executed.error) {
                throw executed.error;
              }
              started = executed.status === 0;
              startExitCode = executed.status ?? null;
              appendWorklogEvent(projectPath, {
                type: "start",
                team: team.team.name,
                status: started ? "ok" : "fail",
                note: started ? `team started in ${effectiveTarget}` : `team start failed in ${effectiveTarget}`,
                meta: {
                  target: effectiveTarget,
                  exit_code: executed.status,
                  run_mode: runInput
                }
              });
              recovery.artifacts.start_exit_code = startExitCode;
              await saveGoRecoveryAsync(recovery);
              markPhase("start", started ? "done" : "failed", `exit_code=${startExitCode ?? -1}`);
            }
          } else if (!commandExists(toolSpec.command)) {
            warn(`Tool command not found: ${toolSpec.command}`);
            markPhase("start", "fallback", "launcher missing");
          } else {
            const execution = runInput
              ? executeRunExecutionPlan(
                  runPlan ?? {
                    supported: false,
                    strategy: "manual",
                    command: toolSpec.command,
                    args: toolSpec.args,
                    prompt: "",
                    reason: "run plan missing"
                  },
                  projectPath
                )
              : launchTool(toolSpec, {
                  cwd: projectPath,
                  runMode: false,
                  prompt: handoffPackage.prompt
                });
            const executed = await execution;
            if (executed.error) {
              throw executed.error;
            }
            started = executed.status === 0;
            startExitCode = executed.status ?? null;
            appendWorklogEvent(projectPath, {
              type: "start",
              team: team.team.name,
              status: started ? "ok" : "fail",
              note: started ? `team started in ${effectiveTarget}` : `team start failed in ${effectiveTarget}`,
              meta: {
                target: effectiveTarget,
                exit_code: executed.status,
                run_mode: runInput
              }
            });
            recovery.artifacts.start_exit_code = startExitCode;
            await saveGoRecoveryAsync(recovery);
            markPhase("start", started ? "done" : "failed", `exit_code=${startExitCode ?? -1}`);
          }
        } else {
          markPhase("start", "fallback", "disabled by --no-start");
        }

        recovery.status = "completed";
        await saveGoRecoveryAsync(recovery);

        const payload = successPayload({
          team_slug: String(upResult.team_slug),
          team_file: String(upResult.team_file),
          target: effectiveTarget,
          project: projectPath,
          launcher: preflight,
          manifest,
          handoff_paths: handoffPaths ?? undefined,
          phase_timeline: phaseTimeline,
          quality: { ...quality, findings: qualityFindings },
          started,
          start_exit_code: startExitCode,
          recovery: recoveryPath
        });
        if (options.json) {
          console.log(toJsonString(payload));
          return;
        }

        banner("Go Complete", effectiveTarget);
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
          await saveGoRecoveryAsync(recovery);
        }
        if (options.json) {
          console.log(
            toJsonString(
              failurePayload({
                blocked_by: "go",
                error: toErrorMessage(e),
                recovery: recoveryPath || undefined,
                phase_timeline: typeof phaseTimeline !== "undefined" ? phaseTimeline : undefined
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
