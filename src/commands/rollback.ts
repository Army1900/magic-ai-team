import { Command } from "commander";
import { writeYamlFile } from "../core/config";
import { resolveTeamFileOrThrow } from "../core/current-team";
import { loadVersionSnapshot, listVersionSnapshots, saveVersionSnapshot } from "../core/versioning";
import { error, info, success } from "../core/ui";

export function registerRollbackCommand(program: Command): void {
  program
    .command("rollback")
    .description("Rollback team.yaml to a previous version snapshot")
    .option("-t, --to <ref>", "target version id or snapshot path")
    .option("-f, --file <path>", "team config path (overrides --team/current)")
    .option("--team <nameOrSlug>", "team from registry (default: current team)")
    .option("-v, --versions-dir <path>", "versions directory", ".openteam/versions")
    .action((options) => {
      try {
        if (!options.to) {
          const snapshots = listVersionSnapshots(options.versionsDir);
          if (snapshots.length === 0) {
            info("No version snapshots found.");
            return;
          }
          info("Available versions:");
          for (const s of snapshots.slice(0, 20)) {
            info(`- ${s.version_id} | ${s.created_at} | ${s.reason} | run=${s.source_run_id ?? "-"}`);
          }
          return;
        }

        const teamFile = resolveTeamFileOrThrow({ file: options.file, team: options.team });
        const target = loadVersionSnapshot(options.to, options.versionsDir);
        writeYamlFile(teamFile, target.team_config);
        const marker = saveVersionSnapshot(
          target.team_config,
          options.versionsDir,
          `rollback_to_${target.version_id}`,
          target.source_run_id
        );

        success(`Rolled back ${teamFile} to ${target.version_id}`);
        info(`Recorded rollback snapshot: ${marker.version_id}`);
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
        info("Next: run `openteam rollback` to list versions, then retry with --to.");
        process.exitCode = 1;
      }
    });
}
