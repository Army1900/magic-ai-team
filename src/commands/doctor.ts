import { Command } from "commander";
import { resolveTeamFileOrThrow } from "../core/current-team";
import { runDoctor } from "../core/doctor";
import { banner, error, info, status } from "../core/ui";

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Run health checks for openteam environment")
    .option("-f, --file <path>", "team config path (overrides --team/current)")
    .option("--team <nameOrSlug>", "team from registry (default: current team)")
    .option("-c, --config <path>", "openteam config path", "openteam.yaml")
    .option("--target <target>", "optional target diagnostics (launcher + compatibility)")
    .action((options) => {
      try {
        const teamFile = resolveTeamFileOrThrow({ file: options.file, team: options.team });
        banner("Doctor", "Environment and config health checks");
        const checks = runDoctor(teamFile, options.config, options.target ? String(options.target) : undefined);
        let hasFail = false;
        for (const check of checks) {
          status(check.status, check.name, check.detail);
          if (check.status === "fail") {
            hasFail = true;
          }
        }

        if (hasFail) {
          process.exitCode = 1;
          info("Next: fix failed checks and rerun `openteam doctor`.");
        }
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
        info("Next: run `openteam team use --name <team>` or `openteam up`.");
        process.exitCode = 1;
      }
    });
}
