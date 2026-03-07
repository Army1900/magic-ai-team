import path from "node:path";
import { Command } from "commander";
import { loadTeamConfig } from "../core/config";
import { resolveTeamFileOrThrow } from "../core/current-team";
import { validateTeamConfig } from "../core/validate";
import { error, info, status, success } from "../core/ui";

export function registerValidateCommand(program: Command): void {
  program
    .command("validate")
    .description("Validate team config against schema")
    .option("-f, --file <path>", "team config path (overrides --team/current)")
    .option("--team <nameOrSlug>", "team from registry (default: current team)")
    .action((options) => {
      const filePath = path.resolve(resolveTeamFileOrThrow({ file: options.file, team: options.team }));
      try {
        const config = loadTeamConfig(filePath);
        const result = validateTeamConfig(config);
        if (result.valid) {
          success(`Config valid: ${filePath}`);
          for (const warning of result.warnings) {
            status("warn", warning);
          }
          if (result.warnings.length > 0) {
            info(`Strict mode: ${result.strict_mode} (set OPENTEAM_SCHEMA_STRICT=fail to enforce)`);
          }
          return;
        }

        error(`Invalid config: ${filePath}`);
        for (const err of result.errors) {
          status("fail", err);
        }
        info("Next: fix the fields above, then rerun `openteam validate`.");
        process.exitCode = 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        status("fail", `Failed to load ${filePath}`, message);
        info("Next: run `openteam team use --name <team>` or pass --file/--team.");
        process.exitCode = 1;
      }
    });
}
