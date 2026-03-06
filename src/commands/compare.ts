import { Command } from "commander";
import { loadTeamConfig } from "../core/config";
import { resolveTeamFileOrThrow } from "../core/current-team";
import { compareTeams } from "../core/compare";
import { loadVersionSnapshot } from "../core/versioning";
import { banner, error, info, success } from "../core/ui";

function resolveTeamFromInput(input: string, versionsDir: string, currentFile: string) {
  if (input === "current") {
    return loadTeamConfig(currentFile);
  }
  const snapshot = loadVersionSnapshot(input, versionsDir);
  return snapshot.team_config;
}

export function registerCompareCommand(program: Command): void {
  program
    .command("compare")
    .description("Compare two team versions (version id/path/current)")
    .requiredOption("-a, --a <ref>", "left reference")
    .requiredOption("-b, --b <ref>", "right reference")
    .option("-v, --versions-dir <path>", "versions directory", ".openteam/versions")
    .option("--current-file <path>", "team config used when ref is 'current' (overrides --team/current)")
    .option("--team <nameOrSlug>", "team from registry used when ref is 'current'")
    .action((options) => {
      try {
        const currentFile = options.currentFile || resolveTeamFileOrThrow({ team: options.team });
        const teamA = resolveTeamFromInput(options.a, options.versionsDir, currentFile);
        const teamB = resolveTeamFromInput(options.b, options.versionsDir, currentFile);
        const diffs = compareTeams(teamA, teamB);

        if (diffs.length === 0) {
          success("No differences found.");
          return;
        }

        banner("Differences", String(diffs.length));
        for (const diff of diffs) {
          info(`- ${diff.field}`);
          info(`  a: ${diff.a}`);
          info(`  b: ${diff.b}`);
        }
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
        info("Next: run `openteam team use --name <team>` or pass --current-file.");
        process.exitCode = 1;
      }
    });
}
