import { Command } from "commander";
import { banner, info, kv, status } from "../core/ui";
import { EXPORT_TARGET_HELP, normalizeExportTarget } from "../core/targets";
import { getLauncherHealth, listLauncherHealth } from "../core/launchers";
import { toJsonString } from "../core/json-output";

export function registerLauncherCommand(program: Command): void {
  const cmd = program.command("launcher").description("Check target launcher command availability");

  cmd
    .command("check")
    .description("Check launcher health for one target or all targets")
    .option("--target <target>", EXPORT_TARGET_HELP)
    .option("--tool-cmd <command>", "override command (only when --target is provided)")
    .option("--json", "json output mode", false)
    .action((options) => {
      const hasTarget = Boolean(options.target);
      const rows = hasTarget
        ? [getLauncherHealth(normalizeExportTarget(String(options.target)), options.toolCmd ? String(options.toolCmd) : undefined)]
        : listLauncherHealth();

      if (options.json) {
        console.log(toJsonString({ success: true, count: rows.length, launchers: rows }));
        return;
      }

      banner("Launcher Health");
      let missing = 0;
      for (const row of rows) {
        const detail = row.args.length > 0 ? `${row.command} ${row.args.join(" ")}` : row.command;
        status(row.available ? "ok" : "warn", row.target, detail);
        if (!row.available) {
          missing += 1;
        }
      }
      kv("missing", missing);
      if (missing > 0) {
        info("Install missing tools or pass --tool-cmd when running `openteam start` / `openteam go`.");
      }
    });
}

