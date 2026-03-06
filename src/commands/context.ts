import { Command } from "commander";
import { loadTeamConfig, writeYamlFile } from "../core/config";
import { resolveTeamFileOrThrow } from "../core/current-team";
import { addContextDoc, lintContextDocs, listContextDocs } from "../core/context";
import { banner, error, info, status, success } from "../core/ui";

export function registerContextCommand(program: Command): void {
  const cmd = program.command("context").description("Manage team context markdown docs");

  cmd
    .command("list")
    .description("List configured context docs")
    .option("-f, --file <path>", "team config path (overrides --team/current)")
    .option("--team <nameOrSlug>", "team from registry (default: current team)")
    .action((options) => {
      try {
        const teamFile = resolveTeamFileOrThrow({ file: options.file, team: options.team });
        const team = loadTeamConfig(teamFile);
        const docs = listContextDocs(team);
        if (docs.length === 0) {
          info("No context docs configured.");
          return;
        }
        banner("Context Docs", `${docs.length} configured`);
        for (const doc of docs) {
          info(`- ${doc}`);
        }
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
        info("Next: run `openteam team use --name <team>` or pass --file/--team.");
        process.exitCode = 1;
      }
    });

  cmd
    .command("add")
    .description("Add a context doc path into current team config")
    .requiredOption("--path <path>", "markdown file path")
    .option("-f, --file <path>", "team config path (overrides --team/current)")
    .option("--team <nameOrSlug>", "team from registry (default: current team)")
    .action((options) => {
      try {
        const teamFile = resolveTeamFileOrThrow({ file: options.file, team: options.team });
        const team = loadTeamConfig(teamFile);
        const added = addContextDoc(team, options.path);
        if (!added) {
          info(`Context doc already exists: ${options.path}`);
          return;
        }
        writeYamlFile(teamFile, team);
        success(`Added context doc: ${options.path}`);
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
        info("Next: run `openteam context list` to verify team file and docs.");
        process.exitCode = 1;
      }
    });

  cmd
    .command("lint")
    .description("Lint context docs existence and quality")
    .option("-f, --file <path>", "team config path (overrides --team/current)")
    .option("--team <nameOrSlug>", "team from registry (default: current team)")
    .action((options) => {
      try {
        const teamFile = resolveTeamFileOrThrow({ file: options.file, team: options.team });
        const team = loadTeamConfig(teamFile);
        const checks = lintContextDocs(team);
        let hasFail = false;
        for (const check of checks) {
          status(check.status, check.path, check.detail);
          if (check.status === "fail") {
            hasFail = true;
          }
        }
        if (hasFail) {
          process.exitCode = 1;
          info("Next: fix missing/invalid docs and rerun `openteam context lint`.");
        }
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
        info("Next: run `openteam team use --name <team>` or pass --file/--team.");
        process.exitCode = 1;
      }
    });
}
