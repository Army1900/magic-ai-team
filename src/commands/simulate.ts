import { Command } from "commander";
import { loadTeamConfig } from "../core/config";
import { resolveTeamFileOrThrow } from "../core/current-team";
import { loadTasksFromDataset } from "../core/dataset";
import { executeTask, saveRunArtifact } from "../core/runtime";
import { error, info, kv, success } from "../core/ui";
import { appendWorklogEvent } from "../core/worklog";

export function registerSimulateCommand(program: Command): void {
  program
    .command("simulate")
    .description("Run offline simulation for a dataset of tasks")
    .requiredOption("-d, --dataset <path>", "dataset path (.txt, .json, .jsonl)")
    .option("-f, --file <path>", "team config path (overrides --team/current)")
    .option("--team <nameOrSlug>", "team from registry (default: current team)")
    .option("--project <path>", "project path for worklog output", ".")
    .option("-m, --max <count>", "max number of tasks", "10")
    .action((options) => {
      try {
        const maxCount = Math.max(1, Number(options.max) || 10);
        const teamFile = resolveTeamFileOrThrow({ file: options.file, team: options.team });
        const team = loadTeamConfig(teamFile);
        const projectPath = options.project ?? ".";
        const tasks = loadTasksFromDataset(options.dataset).slice(0, maxCount);

        if (tasks.length === 0) {
          error("No tasks found in dataset.");
          appendWorklogEvent(projectPath, {
            type: "simulate",
            team: team.team.name,
            status: "fail",
            note: `no tasks found in dataset: ${options.dataset}`
          });
          info("Next: provide a non-empty dataset path with --dataset.");
          process.exitCode = 1;
          return;
        }

        let successCount = 0;
        let totalCost = 0;
        let totalLatency = 0;

        for (const task of tasks) {
          const artifact = executeTask(team, task, "simulate");
          saveRunArtifact(artifact, team.observability.store.runs_dir);
          if (artifact.success) {
            successCount += 1;
          }
          totalCost += artifact.totals.estimated_cost_usd;
          totalLatency += artifact.totals.latency_ms;
        }

        const successRate = successCount / tasks.length;
        kv("simulated_tasks", tasks.length);
        kv("success_rate", `${(successRate * 100).toFixed(1)}%`);
        kv("avg_latency_ms", Math.round(totalLatency / tasks.length));
        kv("avg_cost_usd", (totalCost / tasks.length).toFixed(4));
        success(`Run artifacts: ${team.observability.store.runs_dir}`);
        appendWorklogEvent(projectPath, {
          type: "simulate",
          team: team.team.name,
          status: "ok",
          note: `simulated ${tasks.length} tasks`,
          latency_ms: Math.round(totalLatency / tasks.length),
          cost_usd: Number((totalCost / tasks.length).toFixed(4)),
          meta: {
            dataset: options.dataset,
            simulated_tasks: tasks.length,
            success_rate: Number((successRate * 100).toFixed(1)),
            team_file: teamFile
          }
        });
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
        appendWorklogEvent(options.project ?? ".", {
          type: "simulate",
          status: "fail",
          note: e instanceof Error ? e.message : String(e)
        });
        info("Next: run `openteam team use --name <team>` or pass --file/--team.");
        process.exitCode = 1;
      }
    });
}
