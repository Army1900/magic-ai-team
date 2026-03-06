import { Command } from "commander";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadTeamConfig } from "../core/config";
import { resolveTeamFileOrThrow } from "../core/current-team";
import { appendWorklogEvent } from "../core/worklog";
import { banner, error, info, kv, status, success, warn } from "../core/ui";
import { buildHandoffPackage, writeHandoffPackage } from "../core/handoff";
import { EXPORT_TARGET_HELP } from "../core/targets";
import { assertRunModeSupported, commandExists, launchTool, resolveToolSpec } from "../core/launchers";
import { resolveProjectTarget } from "../core/project-target";
import { reportCommandFailure } from "../core/command-errors";
import { successPayload, toJsonString } from "../core/json-output";

async function confirmStart(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  const answer = (await rl.question(`${message} [y/N]: `)).trim().toLowerCase();
  rl.close();
  return answer === "y" || answer === "yes";
}

export function registerStartCommand(program: Command): void {
  program
    .command("start")
    .description("Start target tool with handoff package (safe by default)")
    .option("--team <nameOrSlug>", "team from registry (default: current team)")
    .option("--file <path>", "explicit team.yaml path (overrides --team)")
    .option("--project <path>", "project path", ".")
    .option("--target <target>", EXPORT_TARGET_HELP)
    .option("--tool-cmd <command>", "override launch command, e.g. \"claude\"")
    .option("--run", "attempt one-shot run by piping START_PROMPT to tool stdin", false)
    .option("--yes", "skip confirmation prompt", false)
    .option("--dry-run", "print launch details only", false)
    .option("--json", "json output mode", false)
    .action(async (options) => {
      try {
        const teamFile = resolveTeamFileOrThrow(options);
        const projectPath = String(options.project ?? ".");
        const target = resolveProjectTarget(projectPath, options.target);
        assertRunModeSupported(target, Boolean(options.run));
        const team = loadTeamConfig(teamFile);
        const handoff = buildHandoffPackage(team, target);
        const paths = writeHandoffPackage(projectPath, handoff);
        const toolSpec = resolveToolSpec(target, options.toolCmd ? String(options.toolCmd) : undefined);

        const payload = {
          team_file: teamFile,
          project: projectPath,
          target,
          tool: toolSpec,
          run_mode: Boolean(options.run),
          handoff_paths: paths
        };

        if (options.json) {
          console.log(toJsonString(successPayload(payload)));
          return;
        }

        banner("Team Start");
        kv("team_file", teamFile);
        kv("project", projectPath);
        kv("target", target);
        kv("tool", `${toolSpec.command} ${toolSpec.args.join(" ")}`.trim());
        kv("run_mode", Boolean(options.run));
        kv("prompt", paths.prompt);

        if (!options.yes) {
          const ok = await confirmStart(`Start team in ${projectPath} using ${toolSpec.command}?`);
          if (!ok) {
            warn("Start cancelled.");
            return;
          }
        }

        if (options.dryRun) {
          info("Dry-run mode: no process launched.");
          info(`Prompt file: ${paths.prompt}`);
          appendWorklogEvent(projectPath, {
            type: "start",
            team: team.team.name,
            status: "ok",
            note: `dry-run start prepared for ${target}`,
            meta: payload
          });
          return;
        }

        if (!commandExists(toolSpec.command)) {
          error(`Tool command not found: ${toolSpec.command}`);
          info(`Use --tool-cmd to override. Example: openteam start --project ${projectPath} --tool-cmd "claude"`);
          appendWorklogEvent(projectPath, {
            type: "start",
            team: team.team.name,
            status: "fail",
            note: `tool command not found: ${toolSpec.command}`,
            meta: payload
          });
          process.exitCode = 1;
          return;
        }

        const execution = launchTool(toolSpec, {
          cwd: projectPath,
          runMode: Boolean(options.run),
          prompt: handoff.prompt
        });

        if (execution.error) {
          throw execution.error;
        }

        const ok = execution.status === 0;
        appendWorklogEvent(projectPath, {
          type: "start",
          team: team.team.name,
          status: ok ? "ok" : "fail",
          note: ok ? `team started in ${target}` : `team start failed in ${target}`,
          meta: {
            ...payload,
            exit_code: execution.status
          }
        });
        if (ok) {
          success("Team start command completed.");
        } else {
          status("fail", "start", `exit_code=${execution.status ?? -1}`);
          process.exitCode = execution.status ?? 1;
        }
      } catch (e) {
        reportCommandFailure({
          error: e,
          errorFn: error,
          infoFn: info,
          nextHint: "Next: run `openteam handoff --project <path>` first, then retry with `openteam start --project <path>`."
        });
      }
    });
}
