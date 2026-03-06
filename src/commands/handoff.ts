import { Command } from "commander";
import { loadTeamConfig } from "../core/config";
import { resolveTeamFileOrThrow } from "../core/current-team";
import { appendWorklogEvent } from "../core/worklog";
import { banner, error, info, kv, success } from "../core/ui";
import { buildHandoffPackage, writeHandoffPackage } from "../core/handoff";
import { EXPORT_TARGET_HELP } from "../core/targets";
import { resolveProjectTarget } from "../core/project-target";
import { reportCommandFailure } from "../core/command-errors";

export function registerHandoffCommand(program: Command): void {
  program
    .command("handoff")
    .description("Generate team handoff brief/prompt for a target project")
    .option("--team <nameOrSlug>", "team from registry (default: current team)")
    .option("--file <path>", "explicit team.yaml path (overrides --team)")
    .option("--project <path>", "project path", ".")
    .option("--target <target>", EXPORT_TARGET_HELP)
    .option("--json", "json output mode", false)
    .action((options) => {
      try {
        const teamFile = resolveTeamFileOrThrow(options);
        const projectPath = String(options.project ?? ".");
        const target = resolveProjectTarget(projectPath, options.target);
        const team = loadTeamConfig(teamFile);
        const handoff = buildHandoffPackage(team, target);
        const paths = writeHandoffPackage(projectPath, handoff);

        appendWorklogEvent(projectPath, {
          type: "handoff",
          team: team.team.name,
          status: "ok",
          note: `handoff generated for ${target}`,
          meta: {
            target,
            team_file: teamFile,
            handoff_paths: paths
          }
        });

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                team_file: teamFile,
                project: projectPath,
                target,
                handoff_paths: paths
              },
              null,
              2
            )
          );
          return;
        }

        banner("Handoff Ready", target);
        kv("team_file", teamFile);
        kv("project", projectPath);
        kv("brief", paths.brief);
        kv("prompt", paths.prompt);
        info("Mission:");
        info(`- ${handoff.mission}`);
        info("First task:");
        info(`- ${handoff.first_task}`);
        success("Handoff package generated.");
      } catch (e) {
        reportCommandFailure({
          error: e,
          errorFn: error,
          infoFn: info,
          nextHint: "Next: run `openteam export --target <target> --out <project-path>` first, or pass --target."
        });
      }
    });
}
