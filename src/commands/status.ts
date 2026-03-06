import { Command } from "commander";
import { getStatusSummary } from "../core/status";
import { banner, info, kv, status } from "../core/ui";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show current operational status summary")
    .option("--team <nameOrSlug>", "team from registry (default: current team)")
    .option("--file <path>", "explicit team.yaml path")
    .option("--json", "json output mode", false)
    .action((options) => {
      const summary = getStatusSummary({ team: options.team, file: options.file });
      if (options.json) {
        console.log(JSON.stringify(summary, null, 2));
        return;
      }
      banner("OpenTeam Status");

      if (summary.team) {
        kv("team", `${summary.team.name} (${summary.team.slug})`);
      } else {
        kv("team", "none selected");
      }
      kv("team_file", summary.team_file ?? "not found");
      kv("planner_model", summary.management_models.planner);
      kv("optimizer_model", summary.management_models.optimizer);
      kv("exporter_model", summary.management_models.exporter_mapper);

      status(
        summary.doctor.fail > 0 ? "fail" : summary.doctor.warn > 0 ? "warn" : "ok",
        "doctor",
        `ok=${summary.doctor.ok} warn=${summary.doctor.warn} fail=${summary.doctor.fail}`
      );
      status(
        summary.policy.failures > 0 ? "fail" : summary.policy.warnings > 0 ? "warn" : "ok",
        "policy",
        `pass=${summary.policy.pass} warn=${summary.policy.warnings} fail=${summary.policy.failures}`
      );

      info(`latest_run: ${summary.latest_run_file ?? "-"}`);
      info(`latest_report: ${summary.latest_report_file ?? "-"}`);
      info(`latest_export_manifest: ${summary.latest_export_manifest ?? "-"}`);
    });
}
