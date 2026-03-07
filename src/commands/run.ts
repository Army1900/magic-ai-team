import { Command } from "commander";
import { loadTeamConfig } from "../core/config";
import { executeTaskWithModels, saveRunArtifact } from "../core/runtime";
import { evaluatePolicies } from "../core/policy";
import { banner, error, info, kv, status, success } from "../core/ui";
import { resolveTeamFileOrThrow } from "../core/current-team";
import { appendWorklogEvent } from "../core/worklog";

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Execute a single task with the configured team")
    .requiredOption("-t, --task <text>", "task text")
    .option("-f, --file <path>", "team config path (default: current team)")
    .option("--team <nameOrSlug>", "team from registry (default: current team)")
    .option("--execution-mode <mode>", "mock|live", "mock")
    .option("--project <path>", "project path for worklog output", ".")
    .option("--no-policy-gate", "disable pre-run policy enforce")
    .option("--json", "json output mode", false)
    .action(async (options) => {
      try {
        const teamFile = resolveTeamFileOrThrow({ file: options.file, team: options.team });
        const team = loadTeamConfig(teamFile);
        const projectPath = options.project ?? ".";
        if (options.policyGate !== false) {
          const policy = evaluatePolicies(team);
          const fails = policy.findings.filter((f) => f.severity === "fail");
          if (fails.length > 0) {
            if (options.json) {
              console.log(
                JSON.stringify(
                  {
                    success: false,
                    blocked_by_policy: true,
                    findings: fails
                  },
                  null,
                  2
                )
              );
              process.exitCode = 1;
              return;
            }
            error("Run blocked by policy gate:");
            for (const finding of fails) {
              status("fail", finding.code, finding.message);
            }
            appendWorklogEvent(projectPath, {
              type: "run",
              team: team.team.name,
              task: options.task,
              status: "fail",
              note: "blocked by policy gate",
              meta: { findings: fails }
            });
            info("Next: openteam policy show");
            process.exitCode = 1;
            return;
          }
        }

        const mode = options.executionMode === "live" ? "live" : "mock";
        const artifact = await executeTaskWithModels(team, options.task, mode);
        const outPath = saveRunArtifact(artifact, team.observability.store.runs_dir);
        appendWorklogEvent(projectPath, {
          type: "run",
          team: team.team.name,
          task: options.task,
          status: artifact.success ? "ok" : "fail",
          latency_ms: artifact.totals.latency_ms,
          cost_usd: artifact.totals.estimated_cost_usd,
          tokens: artifact.totals.estimated_tokens,
          artifact_path: outPath,
          note: artifact.success ? "run completed" : artifact.failure_reason ?? "run failed",
          meta: {
            run_id: artifact.run_id,
            execution_mode: mode,
            team_file: teamFile
          }
        });
        for (const step of artifact.steps) {
          appendWorklogEvent(projectPath, {
            type: "run_step",
            team: team.team.name,
            agent: step.agent_id,
            task: options.task,
            status: step.status,
            latency_ms: step.latency_ms,
            cost_usd: step.estimated_cost_usd,
            tokens: step.estimated_tokens,
            note: `model=${step.model}`,
            meta: {
              run_id: artifact.run_id,
              model: step.model,
              execution_mode: mode,
              team_file: teamFile
            }
          });
        }

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                team_file: teamFile,
                execution_mode: mode,
                artifact,
                saved: outPath
              },
              null,
              2
            )
          );
          if (!artifact.success) {
            process.exitCode = 1;
          }
          return;
        }

        banner("Run Result", artifact.run_id);
        kv("success", artifact.success);
        kv("team_file", teamFile);
        kv("execution_mode", mode);
        kv("latency_ms", artifact.totals.latency_ms);
        kv("cost_usd", artifact.totals.estimated_cost_usd.toFixed(4));
        if (artifact.failure_reason) {
          status("warn", "failure_reason", artifact.failure_reason);
        } else {
          success("Run completed successfully.");
        }
        kv("saved", outPath);
        if (!artifact.success) {
          process.exitCode = 1;
        }
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
        appendWorklogEvent(options.project ?? ".", {
          type: "run",
          status: "fail",
          note: e instanceof Error ? e.message : String(e)
        });
        info("Next: run `openteam team use --name <team>` or `openteam provider test`.");
        process.exitCode = 1;
      }
    });
}
