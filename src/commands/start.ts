import { Command } from "commander";
import { spawnSync } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadTeamConfig } from "../core/config";
import { resolveTeamFileOrThrow } from "../core/current-team";
import { ExportTarget } from "../core/exporters";
import { appendWorklogEvent } from "../core/worklog";
import { banner, error, info, kv, status, success, warn } from "../core/ui";
import { buildHandoffPackage, isExportTarget, readLastExportTarget, writeHandoffPackage } from "../core/handoff";

function commandExists(command: string): boolean {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(probe, [command], { stdio: "ignore" });
  return result.status === 0;
}

function splitCommandLine(inputCmd: string): { command: string; args: string[] } {
  const parts = inputCmd.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    throw new Error("Empty --tool-cmd.");
  }
  return { command: parts[0], args: parts.slice(1) };
}

function resolveTarget(projectPath: string, target?: string): ExportTarget {
  if (target) {
    if (!isExportTarget(target)) {
      throw new Error("Unsupported target. Use one of: opencode, openclaw, claude, codex, aider, continue, cline, openhands, tabby");
    }
    return target;
  }
  const detected = readLastExportTarget(projectPath);
  return detected ?? "claude";
}

function defaultToolCommand(target: ExportTarget): string {
  if (target === "opencode") return "opencode";
  if (target === "openclaw") return "openclaw";
  if (target === "claude") return "claude";
  if (target === "codex") return "codex";
  if (target === "aider") return "aider";
  if (target === "continue") return "continue";
  if (target === "cline") return "cline";
  if (target === "openhands") return "openhands";
  return "tabby";
}

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
    .option("--target <target>", "opencode|openclaw|claude|codex|aider|continue|cline|openhands|tabby")
    .option("--tool-cmd <command>", "override launch command, e.g. \"claude\"")
    .option("--run", "attempt one-shot run by piping START_PROMPT to tool stdin", false)
    .option("--yes", "skip confirmation prompt", false)
    .option("--dry-run", "print launch details only", false)
    .option("--json", "json output mode", false)
    .action(async (options) => {
      try {
        const teamFile = resolveTeamFileOrThrow(options);
        const projectPath = String(options.project ?? ".");
        const target = resolveTarget(projectPath, options.target);
        const team = loadTeamConfig(teamFile);
        const handoff = buildHandoffPackage(team, target);
        const paths = writeHandoffPackage(projectPath, handoff);
        const toolSpec = splitCommandLine(options.toolCmd ? String(options.toolCmd) : defaultToolCommand(target));

        const payload = {
          team_file: teamFile,
          project: projectPath,
          target,
          tool: toolSpec,
          run_mode: Boolean(options.run),
          handoff_paths: paths
        };

        if (options.json) {
          console.log(JSON.stringify({ success: true, ...payload }, null, 2));
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

        const execution = options.run
          ? spawnSync(toolSpec.command, toolSpec.args, {
              cwd: projectPath,
              stdio: ["pipe", "inherit", "inherit"],
              input: `${handoff.prompt}\n`,
              encoding: "utf8"
            })
          : spawnSync(toolSpec.command, toolSpec.args, {
              cwd: projectPath,
              stdio: "inherit"
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
        error(e instanceof Error ? e.message : String(e));
        info("Next: run `openteam handoff --project <path>` first, then retry with `openteam start --project <path>`.");
        process.exitCode = 1;
      }
    });
}

