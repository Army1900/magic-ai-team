import { Command } from "commander";
import { loadTeamConfig } from "../core/config";
import { resolveTeamFileOrThrow } from "../core/current-team";
import { evaluateRun, saveEvalReport } from "../core/evaluate";
import { loadRunArtifact } from "../core/runtime";
import { banner, error, info, kv, success } from "../core/ui";
import { appendWorklogEvent } from "../core/worklog";

export function registerEvaluateCommand(program: Command): void {
  program
    .command("evaluate")
    .description("Evaluate a run artifact and generate report")
    .requiredOption("-r, --run <idOrPath>", "run id (without extension) or json path")
    .option("-f, --file <path>", "team config path (overrides --team/current)")
    .option("--team <nameOrSlug>", "team from registry (default: current team)")
    .option("--project <path>", "project path for worklog output", ".")
    .action((options) => {
      try {
        const teamFile = resolveTeamFileOrThrow({ file: options.file, team: options.team });
        const team = loadTeamConfig(teamFile);
        const projectPath = options.project ?? ".";
        const run = loadRunArtifact(options.run, team.observability.store.runs_dir);
        const report = evaluateRun(team, run);
        const outPath = saveEvalReport(report, team.observability.store.reports_dir);

        banner("Evaluation Report", report.report_id);
        kv("run_id", report.run_id);
        kv("overall_score", report.summary.overall_score);
        kv("quality_score", report.summary.quality_score);
        kv("reliability_score", report.summary.reliability_score);
        kv("cost_efficiency", report.summary.cost_efficiency_score);
        info("Recommendations:");
        for (const recommendation of report.recommendations) {
          info(`- ${recommendation}`);
        }
        success(`Saved: ${outPath}`);
        appendWorklogEvent(projectPath, {
          type: "evaluate",
          team: team.team.name,
          status: "ok",
          note: `evaluated run ${report.run_id}`,
          artifact_path: outPath,
          meta: {
            run_id: report.run_id,
            report_id: report.report_id,
            overall_score: report.summary.overall_score,
            quality_score: report.summary.quality_score,
            reliability_score: report.summary.reliability_score,
            team_file: teamFile
          }
        });
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
        appendWorklogEvent(options.project ?? ".", {
          type: "evaluate",
          status: "fail",
          note: e instanceof Error ? e.message : String(e)
        });
        info("Next: run `openteam status` to find latest run/report paths.");
        process.exitCode = 1;
      }
    });
}
