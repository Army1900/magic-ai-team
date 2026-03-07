import { Command } from "commander";
import { banner, info, kv, status, warn } from "../core/ui";
import { readGoHistory } from "../core/go-history";
import { toJsonString } from "../core/json-output";

export function registerHistoryCommand(program: Command): void {
  program
    .command("history")
    .description("Show recent OpenTeam history records")
    .option("--limit <n>", "max number of records", "20")
    .option("--json", "json output mode", false)
    .action((options) => {
      const limit = Math.max(1, Number(options.limit ?? 20));
      const rows = readGoHistory(limit);
      if (options.json) {
        console.log(toJsonString({ records: rows, total: rows.length }));
        return;
      }

      banner("History", "go records");
      kv("count", rows.length);
      if (rows.length === 0) {
        warn("No go history yet. Run `openteam go` first.");
        return;
      }
      for (const row of rows) {
        const head = `${row.ts} | ${row.status.toUpperCase()} | target=${row.target ?? "-"} | team=${row.team_slug ?? "-"}`;
        if (row.status === "ok") {
          status("ok", "go", head);
        } else {
          status("fail", "go", head);
        }
        info(`  project=${row.project ?? "-"} recovery=${row.recovery ?? "-"}`);
        if (row.summary) {
          info(
            `  summary: ready=${String(row.summary.ready_to_start ?? "-")} quality=${String(row.summary.quality_overall ?? "-")} issues=${(row.summary.top_issue_codes ?? []).join(", ") || "-"}`
          );
        }
        if (row.error) {
          info(`  error: ${row.error}`);
        }
      }
    });
}

