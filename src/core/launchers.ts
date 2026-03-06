import { spawnSync, SpawnSyncReturns } from "node:child_process";
import { EXPORT_TARGETS, ExportTarget, getDefaultToolCommand } from "./targets";

export interface ToolSpec {
  command: string;
  args: string[];
}

export interface LaunchAdapter {
  target: ExportTarget;
  command: string;
  supports_stdin_run: boolean;
}

export interface LauncherHealth {
  target: ExportTarget;
  command: string;
  args: string[];
  available: boolean;
  supports_stdin_run: boolean;
}

const ADAPTERS: Record<ExportTarget, LaunchAdapter> = {
  opencode: { target: "opencode", command: "opencode", supports_stdin_run: true },
  openclaw: { target: "openclaw", command: "openclaw", supports_stdin_run: true },
  claude: { target: "claude", command: "claude", supports_stdin_run: true },
  codex: { target: "codex", command: "codex", supports_stdin_run: true },
  aider: { target: "aider", command: "aider", supports_stdin_run: true },
  continue: { target: "continue", command: "continue", supports_stdin_run: true },
  cline: { target: "cline", command: "cline", supports_stdin_run: true },
  openhands: { target: "openhands", command: "openhands", supports_stdin_run: true },
  tabby: { target: "tabby", command: "tabby", supports_stdin_run: true }
};

export function getLaunchAdapter(target: ExportTarget): LaunchAdapter {
  return ADAPTERS[target];
}

export function parseToolCommand(inputCmd: string): ToolSpec {
  const parts = inputCmd.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    throw new Error("Empty --tool-cmd.");
  }
  return { command: parts[0], args: parts.slice(1) };
}

export function resolveToolSpec(target: ExportTarget, overrideCmd?: string): ToolSpec {
  if (overrideCmd && overrideCmd.trim()) {
    return parseToolCommand(overrideCmd);
  }
  const adapter = getLaunchAdapter(target);
  const fallback = getDefaultToolCommand(target);
  return parseToolCommand(adapter.command || fallback);
}

export function commandExists(command: string): boolean {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(probe, [command], { stdio: "ignore" });
  return result.status === 0;
}

export function launchTool(
  tool: ToolSpec,
  options: { cwd: string; runMode: boolean; prompt: string }
): SpawnSyncReturns<string> {
  if (options.runMode) {
    return spawnSync(tool.command, tool.args, {
      cwd: options.cwd,
      stdio: ["pipe", "inherit", "inherit"],
      input: `${options.prompt}\n`,
      encoding: "utf8"
    });
  }
  return spawnSync(tool.command, tool.args, {
    cwd: options.cwd,
    stdio: "inherit",
    encoding: "utf8"
  });
}

export function getLauncherHealth(target: ExportTarget, overrideCmd?: string): LauncherHealth {
  const adapter = getLaunchAdapter(target);
  const tool = resolveToolSpec(target, overrideCmd);
  return {
    target,
    command: tool.command,
    args: tool.args,
    available: commandExists(tool.command),
    supports_stdin_run: adapter.supports_stdin_run
  };
}

export function listLauncherHealth(): LauncherHealth[] {
  return EXPORT_TARGETS.map((target) => getLauncherHealth(target));
}
