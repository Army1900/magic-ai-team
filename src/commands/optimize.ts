import { Command } from "commander";
import { loadTeamConfig, writeYamlFile } from "../core/config";
import { loadRunArtifact } from "../core/runtime";
import { optimizeTeamFromRun } from "../core/optimize";
import { saveVersionSnapshot } from "../core/versioning";
import { banner, error, info, status, success } from "../core/ui";
import { resolveTeamFileOrThrow } from "../core/current-team";
import { resolveManagementModel } from "../core/management-models";
import { invokeModel } from "../core/model-providers";
import { appendWorklogEvent } from "../core/worklog";

function applyAiHints(team: ReturnType<typeof loadTeamConfig>, hintText: string): string[] {
  const applied: string[] = [];
  const lines = hintText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  for (const line of lines) {
    const m = line.match(/^SET\s+(.+?)=(.+)$/i);
    if (!m) continue;
    const key = m[1].trim();
    const value = m[2].trim();

    if (key === "policies.budget.max_cost_usd_per_run") {
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      team.policies.budget.max_cost_usd_per_run = n;
      applied.push(`${key}=${n}`);
      continue;
    }
    if (key === "policies.latency.p95_ms_max") {
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      team.policies.latency.p95_ms_max = n;
      applied.push(`${key}=${n}`);
      continue;
    }
    const agentModel = key.match(/^execution_plane\.agents\.([a-zA-Z0-9_-]+)\.model\.primary$/);
    if (agentModel) {
      const agentId = agentModel[1];
      const agent = team.execution_plane.agents.find((a) => a.id === agentId);
      if (!agent) continue;
      agent.model.primary = value;
      applied.push(`${key}=${value}`);
    }
  }
  return applied;
}

export function registerOptimizeCommand(program: Command): void {
  program
    .command("optimize")
    .description("Generate optimization changes from a run (AI-first, rule-fallback), optionally apply them")
    .requiredOption("-r, --run <idOrPath>", "run id or path")
    .option("-f, --file <path>", "team config path (default: current team)")
    .option("--team <nameOrSlug>", "team from registry (default: current team)")
    .option("--optimizer-model <model>", "override optimizer model")
    .option("--optimizer-execution-mode <mode>", "mock|live", "mock")
    .option("--project <path>", "project path for worklog output", ".")
    .option("--apply", "apply changes to team.yaml", false)
    .action(async (options) => {
      try {
        const teamFile = resolveTeamFileOrThrow({ file: options.file, team: options.team });
        const team = loadTeamConfig(teamFile);
        const projectPath = options.project ?? ".";
        const run = loadRunArtifact(options.run, team.observability.store.runs_dir);

        const original = JSON.parse(JSON.stringify(team));
        const optimizerModel = resolveManagementModel("optimizer", options.optimizerModel);
        const optimizerMode = options.optimizerExecutionMode === "live" ? "live" : "mock";

        let aiApplied: string[] = [];
        try {
          const ai = await invokeModel(
            {
              model: optimizerModel,
              prompt:
                `You are an optimizer for agent teams.\n` +
                `Given run summary, provide 1-3 actionable lines in this exact format:\n` +
                `SET <path>=<value>\n` +
                `Allowed paths:\n` +
                `- policies.budget.max_cost_usd_per_run\n` +
                `- policies.latency.p95_ms_max\n` +
                `- execution_plane.agents.<agent_id>.model.primary\n\n` +
                `Run:\n${JSON.stringify(run, null, 2)}`
            },
            optimizerMode
          );
          aiApplied = applyAiHints(team, ai.text ?? "");
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          status("warn", "optimizer_fallback", `AI optimizer unavailable, fallback to rule mode (${msg})`);
        }

        let result = optimizeTeamFromRun(team, run);
        if (aiApplied.length > 0) {
          result = {
            applied: true,
            reason: `ai_optimizer(${optimizerModel})`,
            changes: aiApplied.map((item) => ({
              type: "policy_change",
              path: item.split("=")[0],
              before: "(auto)",
              after: item.split("=").slice(1).join("=")
            }))
          };
        }

        if (!result.applied) {
          info(`No changes applied. reason=${result.reason}`);
          appendWorklogEvent(projectPath, {
            type: "optimize",
            team: team.team.name,
            status: "ok",
            note: `no changes applied (${result.reason})`,
            meta: { run_id: run.run_id, team_file: teamFile }
          });
          return;
        }

        banner("Optimization Plan", result.reason);
        info("Proposed changes:");
        for (const change of result.changes) {
          info(`- [${change.type}] ${change.path}: ${change.before} -> ${change.after}`);
        }

        if (!options.apply) {
          info("Dry run only. Use --apply to persist changes.");
          appendWorklogEvent(projectPath, {
            type: "optimize",
            team: team.team.name,
            status: "ok",
            note: `dry run changes=${result.changes.length}`,
            meta: { run_id: run.run_id, team_file: teamFile, applied: false }
          });
          return;
        }

        const versionsDir = ".openteam/versions";
        const before = saveVersionSnapshot(original, versionsDir, "before_optimize", run.run_id);
        writeYamlFile(teamFile, team);
        const after = saveVersionSnapshot(team, versionsDir, "after_optimize", run.run_id);

        success(`Applied and saved: ${teamFile}`);
        info(`Version snapshots: ${before.version_id} -> ${after.version_id}`);
        appendWorklogEvent(projectPath, {
          type: "optimize",
          team: team.team.name,
          status: "ok",
          note: `applied changes=${result.changes.length}`,
          meta: {
            run_id: run.run_id,
            team_file: teamFile,
            before_version: before.version_id,
            after_version: after.version_id,
            applied: true
          }
        });
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
        appendWorklogEvent(options.project ?? ".", {
          type: "optimize",
          status: "fail",
          note: e instanceof Error ? e.message : String(e)
        });
        info("Next: verify --run id/path and current team, then retry optimize.");
        process.exitCode = 1;
      }
    });
}
