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
import { suggestFixes } from "../core/self-heal";
import { loadOrCreateOpenTeamConfig, saveOpenTeamConfig } from "../core/marketplace";
import { buildGoSummary, GoPhase, GoPhaseEvent, PhaseState } from "../core/go-summary";
import { appendGoHistory, GoHistoryRecord } from "../core/go-history";
import { Locale, resolveLocale, t } from "../core/i18n";
import { evaluateTeamQualityGate } from "../core/quality-gate";

async function confirmStart(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  const answer = (await rl.question(`${message} [y/N]: `)).trim().toLowerCase();
  rl.close();
  return answer === "y" || answer === "yes";
}

function hasCliFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function phaseStatusKind(state: PhaseState): "ok" | "warn" | "fail" {
  if (state === "done") return "ok";
  if (state === "failed") return "fail";
  return "warn";
}

function phaseEtaMs(phase: GoPhase): number {
  return phase === "up" ? 12000 : phase === "export" ? 9000 : phase === "handoff" ? 1500 : 4000;
}

function phaseNext(phase: GoPhase): string {
  return phase === "up"
    ? "export"
    : phase === "export"
    ? "handoff"
    : phase === "handoff"
    ? "start"
    : "monitor";
}

function phaseAction(phase: GoPhase): string {
  return phase === "up"
    ? "collecting discovery and generating team topology"
    : phase === "export"
    ? "running quality gates and exporting target artifacts"
    : phase === "handoff"
    ? "building TEAM_BRIEF and START_PROMPT"
    : "checking launcher and starting target tool";
}

function say(locale: Locale, en: string, zh: string): string {
  return locale === "zh" ? zh : en;
}

function appendGoHistorySafe(
  record: Omit<GoHistoryRecord, "ts"> & { ts?: string },
  options: { json: boolean; locale: Locale }
): void {
  try {
    appendGoHistory(record);
  } catch (e) {
    if (options.json) return;
    const msg = toErrorMessage(e);
    status("warn", "GO_HISTORY_WRITE_FAILED", say(options.locale, `history write skipped: ${msg}`, `历史记录写入已跳过: ${msg}`));
  }
}

function fixForFindingCode(code: string, projectPath: string, target: string): string | null {
  if (code.includes("HIGH_RISK_")) return "openteam go --ignore-high-risk";
  if (code.includes("SCANNER_GITLEAKS")) return `gitleaks detect --source ${projectPath}`;
  if (code.includes("SCANNER_SEMGREP")) return `semgrep scan --config auto ${projectPath}`;
  if (code.includes("SCANNER_TRIVY")) return `trivy fs --severity HIGH,CRITICAL ${projectPath}`;
  if (code.includes("LAUNCHER_MISSING")) return "openteam launcher check";
  if (code.includes("TARGET_")) return `openteam export --target ${target} --out ${projectPath} --strict-target`;
  return null;
}

async function confirmContinueOnce(message: string): Promise<boolean> {
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
    .option("--view <mode>", "simple|advanced output verbosity", "simple")
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
        const cfg = loadOrCreateOpenTeamConfig();
        const locale = resolveLocale(`${options.name ?? ""} ${options.goal ?? ""} ${cfg.preferences?.last_locale ?? ""}`);
        const resumeMode = Boolean(options.resume);
        const targetInput =
          resumeMode && recovery && !hasCliFlag("--target")
            ? recovery.options.target
            : options.target ?? recovery?.options.target ?? cfg.preferences?.last_target ?? "claude";
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
            : hasCliFlag("--no-start")
            ? false
            : !Boolean(cfg.preferences?.last_no_start) && Boolean(options.start);

        const target = normalizeExportTarget(targetInput);
        const projectPath = String(projectInput);
        const strict = Boolean(options.strict);
        const strictTarget = Boolean(options.strictTarget);
        const ignoreHighRisk = Boolean(options.ignoreHighRisk);
        const shouldStart = options.json ? false : shouldStartInput;
        const autoYes = options.json ? true : Boolean(options.yes);
        const viewMode = String(options.view ?? "simple").toLowerCase() === "advanced" ? "advanced" : "simple";
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
            if (viewMode === "simple" && state === "queued") return;
            const elapsed = elapsedMs !== undefined ? ` elapsed=${elapsedMs}ms` : "";
            const eta = state === "running" ? ` eta~${phaseEtaMs(phase)}ms` : "";
            const next = state === "running" || state === "done" || state === "fallback" ? ` next=${phaseNext(phase)}` : "";
            const doing = state === "running" ? ` doing=${phaseAction(phase)}` : "";
            status(
              phaseStatusKind(state),
              `phase:${phase}`,
              `${state}${elapsed}${eta}${next}${doing}${detail ? ` | ${detail}` : ""}`
            );
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
        let qualityGate = evaluateTeamQualityGate(team, {
          projectPath,
          includeScanners: true,
          ignoreHighRisk
        });
        if (!options.json && !ignoreHighRisk && qualityGate.onlyHighRiskFails) {
          const goOn = await confirmContinueOnce(
            say(
              locale,
              "High-risk gate blocked this run. Continue once by ignoring high-risk findings?",
              "本次被高风险门禁拦截。是否仅本次忽略高风险并继续？"
            )
          );
          if (goOn) {
            qualityGate = evaluateTeamQualityGate(team, {
              projectPath,
              includeScanners: true,
              ignoreHighRisk: true
            });
            markPhase("export", "fallback", "high-risk ignored for this run only");
          }
        }
        if (qualityGate.blocked) {
          markPhase("export", "failed", "team quality gate blocked");
          if (options.json) {
            console.log(
              toJsonString(
                failurePayload({
                  blocked_by: "team_quality",
                  team_file: String(upResult.team_file),
                  target: effectiveTarget,
                  quality: { ...qualityGate.report, findings: qualityGate.findings },
                  phase_timeline: phaseTimeline,
                  recovery: recoveryPath
                })
              )
            );
            process.exitCode = 1;
            return;
          }
          error(say(locale, "Go blocked by team quality gate before export.", "Go 在导出前被团队质量门禁阻断。"));
          for (const finding of qualityGate.findings) {
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
          for (const finding of qualityGate.warns) {
            status("warn", finding.code, finding.message);
          }
          for (const scanner of qualityGate.report.scanner_summary) {
            status(scanner.status === "warn" ? "warn" : "ok", `scanner:${scanner.tool}`, scanner.detail);
          }
        }
        const handoffPackage = buildHandoffPackage(team, effectiveTarget);
        const preflight = shouldStart
          ? getLauncherHealth(effectiveTarget, options.toolCmd ? String(options.toolCmd) : undefined)
          : null;
        if (preflight && !preflight.available && !options.json) {
          warn(
            say(
              locale,
              `Launcher precheck: command not found for ${effectiveTarget} -> ${preflight.command}`,
              `启动器预检: 未找到 ${effectiveTarget} 的命令 -> ${preflight.command}`
            )
          );
          info(
            say(
              locale,
              "Start phase may be skipped unless you install the tool or pass --tool-cmd.",
              "若未安装目标工具或未传 --tool-cmd，start 阶段可能会被跳过。"
            )
          );
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
          error(say(locale, "Go blocked by policy gate before export.", "Go 在导出前被策略门禁阻断。"));
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
          error(
            say(
              locale,
              `Go blocked by ${effectiveTarget} compatibility gate before export.`,
              `Go 在导出前被 ${effectiveTarget} 兼容性门禁阻断。`
            )
          );
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
            error(
              say(
                locale,
                `Go blocked by ${effectiveTarget} target validation.`,
                `Go 被 ${effectiveTarget} 目标校验阻断。`
              )
            );
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
            error(
              say(
                locale,
                `Go blocked by ${effectiveTarget} export self-check.`,
                `Go 被 ${effectiveTarget} 导出自检阻断。`
              )
            );
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
              warn(say(locale, "Start skipped by user confirmation.", "根据你的确认已跳过 start。"));
              markPhase("start", "fallback", "skipped by confirmation");
            } else if (!commandExists(toolSpec.command)) {
              warn(say(locale, `Tool command not found: ${toolSpec.command}`, `未找到工具命令: ${toolSpec.command}`));
              info(
                say(
                  locale,
                  `Use --tool-cmd to override. Example: openteam go --project ${projectPath} --tool-cmd "claude"`,
                  `可用 --tool-cmd 覆盖命令。例如: openteam go --project ${projectPath} --tool-cmd "claude"`
                )
              );
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
            warn(say(locale, `Tool command not found: ${toolSpec.command}`, `未找到工具命令: ${toolSpec.command}`));
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
        const qualityWarns = qualityGate.warns;
        const scannerWarns = qualityGate.report.scanner_summary.filter((s) => s.status === "warn");
        const scannerFails = qualityGate.report.scanner_summary.filter((s) => s.status === "fail");
        const readyToStart = Boolean(preflight?.available ?? true) && !qualityGate.blocked;
        const topIssues = [
          ...qualityWarns.map((f) => ({ code: f.code, message: f.message })),
          ...scannerWarns.map((s) => ({ code: `SCANNER_${s.tool.toUpperCase()}_WARN`, message: `${s.tool}: ${s.detail}` })),
          ...scannerFails.map((s) => ({ code: `SCANNER_${s.tool.toUpperCase()}_FAIL`, message: `${s.tool}: ${s.detail}` }))
        ].slice(0, 3);
        const quickFixes = [
          ...topIssues
            .map((i) => fixForFindingCode(i.code, projectPath, effectiveTarget))
            .filter((x): x is string => Boolean(x)),
          ...suggestFixes(topIssues.map((i) => i.message).join(" | "))
        ].filter((x, idx, arr) => arr.indexOf(x) === idx).slice(0, 3);
        const summary = buildGoSummary({
          readyToStart,
          qualityOverall: qualityGate.report.scores.overall,
          qualityWarns: qualityWarns.length,
          scannerWarns: scannerWarns.length,
          scannerFails: scannerFails.length,
          changes: {
            agents: team.execution_plane.agents.length,
            skills: team.resources.skills.length,
            mcps: team.resources.mcps.length
          },
          phaseTimeline,
          topIssues,
          quickFixes
        });

        const payload = successPayload({
          team_slug: String(upResult.team_slug),
          team_file: String(upResult.team_file),
          target: effectiveTarget,
          project: projectPath,
          launcher: preflight,
          manifest,
          handoff_paths: handoffPaths ?? undefined,
          phase_timeline: phaseTimeline,
          quality: { ...qualityGate.report, findings: qualityGate.findings },
          summary,
          started,
          start_exit_code: startExitCode,
          recovery: recoveryPath
        });
        if (options.json) {
          console.log(toJsonString(payload));
          return;
        }

        banner(t(locale, "go_complete"), effectiveTarget);
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
          info(say(locale, "Start skipped by --no-start.", "根据 --no-start 已跳过 start。"));
          info(say(locale, `Next: openteam start --project ${projectPath}`, `下一步: openteam start --project ${projectPath}`));
        }
        banner(t(locale, "go_summary"), String(upResult.team_slug));
        kv("ready_to_start", summary.ready_to_start);
        kv("quality_overall", summary.quality_overall);
        if (viewMode === "advanced") {
          kv("quality_warns", summary.quality_warns);
          kv("scanner_warns", summary.scanner_warns);
          kv("scanner_fails", summary.scanner_fails);
          kv("agents", summary.changes.agents);
          kv("skills", summary.changes.skills);
          kv("mcps", summary.changes.mcps);
          for (const phase of phaseOrder) {
            const ms = summary.phase_durations_ms[phase];
            if (typeof ms === "number") {
              kv(`phase_${phase}_ms`, ms);
            }
          }
          if (summary.top_issues.length > 0) {
            info(t(locale, "go_top_issues"));
            for (const issue of summary.top_issues) {
              status("warn", issue.code, issue.message);
            }
          }
        }
        if (summary.quick_fixes.length > 0) {
          for (const fix of summary.quick_fixes) {
            info(`Fix now: ${fix}`);
          }
        }
        info(
          t(locale, "go_next_monitor", { project: projectPath })
        );
        success(t(locale, "go_finished"));
        appendGoHistorySafe({
          status: "ok",
          target: effectiveTarget,
          project: projectPath,
          team_slug: String(upResult.team_slug),
          team_file: String(upResult.team_file),
          recovery: recoveryPath,
          summary: {
            ready_to_start: summary.ready_to_start,
            quality_overall: summary.quality_overall,
            top_issue_codes: summary.top_issues.map((x) => x.code)
          }
        }, { json: Boolean(options.json), locale });
        cfg.preferences = {
          ...(cfg.preferences ?? {}),
          last_target: effectiveTarget,
          last_no_start: !shouldStart,
          last_locale: locale
        };
        saveOpenTeamConfig(cfg);
      } catch (e) {
        const targetMaybe = options?.target ? String(options.target) : undefined;
        const projectMaybe = options?.project ? String(options.project) : undefined;
        if (recovery) {
          recovery.status = "failed";
          recovery.last_error = toErrorMessage(e);
          await saveGoRecoveryAsync(recovery);
        }
        appendGoHistorySafe({
          status: "fail",
          target: targetMaybe,
          project: projectMaybe,
          team_slug: recovery?.artifacts.team_slug,
          team_file: recovery?.artifacts.team_file,
          recovery: recoveryPath || undefined,
          error: toErrorMessage(e)
        }, { json: Boolean(options.json), locale: resolveLocale(`${options?.name ?? ""} ${options?.goal ?? ""}`) });
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
