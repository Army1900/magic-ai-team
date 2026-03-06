import { spawnSync, SpawnSyncReturns } from "node:child_process";
import { loadOpenTeamConfig } from "./config";
import { EXPORT_TARGETS, ExportTarget, getDefaultToolCommand } from "./targets";

export interface ToolSpec {
  command: string;
  args: string[];
}

export interface LauncherRunOverride {
  mode?: "stdin" | "args" | "manual";
  args_template?: string[];
  manual_hint?: string;
}

export interface LaunchAdapter {
  target: ExportTarget;
  command: string;
  supports_stdin_run: boolean;
  run_strategy: "stdin" | "manual";
  manual_hint?: string;
}

export interface LauncherHealth {
  target: ExportTarget;
  command: string;
  args: string[];
  available: boolean;
  supports_stdin_run: boolean;
}

export interface RunExecutionPlan {
  supported: boolean;
  strategy: "stdin" | "args" | "manual";
  command: string;
  args: string[];
  prompt: string;
  reason?: string;
  manual_hint?: string;
}

const ADAPTERS: Record<ExportTarget, LaunchAdapter> = {
  opencode: { target: "opencode", command: "opencode", supports_stdin_run: true, run_strategy: "stdin" },
  openclaw: { target: "openclaw", command: "openclaw", supports_stdin_run: true, run_strategy: "stdin" },
  claude: { target: "claude", command: "claude", supports_stdin_run: true, run_strategy: "stdin" },
  codex: { target: "codex", command: "codex", supports_stdin_run: true, run_strategy: "stdin" },
  aider: { target: "aider", command: "aider", supports_stdin_run: true, run_strategy: "stdin" },
  continue: {
    target: "continue",
    command: "continue",
    supports_stdin_run: false,
    run_strategy: "manual",
    manual_hint: "Configure launchers.continue.run args_template in openteam.yaml to enable --run."
  },
  cline: {
    target: "cline",
    command: "cline",
    supports_stdin_run: false,
    run_strategy: "manual",
    manual_hint: "Configure launchers.cline.run args_template in openteam.yaml to enable --run."
  },
  openhands: {
    target: "openhands",
    command: "openhands",
    supports_stdin_run: false,
    run_strategy: "manual",
    manual_hint: "Configure launchers.openhands.run args_template in openteam.yaml to enable --run."
  },
  tabby: {
    target: "tabby",
    command: "tabby",
    supports_stdin_run: false,
    run_strategy: "manual",
    manual_hint: "Configure launchers.tabby.run args_template in openteam.yaml to enable --run."
  }
};

function getLauncherRunOverride(target: ExportTarget): LauncherRunOverride | null {
  try {
    const cfg = loadOpenTeamConfig("openteam.yaml");
    const launchers = cfg.launchers as Record<string, { run?: LauncherRunOverride }> | undefined;
    return launchers?.[target]?.run ?? null;
  } catch {
    return null;
  }
}

function fillTemplate(template: string, values: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(values)) {
    out = out.replaceAll(`{${k}}`, v);
  }
  return out;
}

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

export function resolveRunExecutionPlan(input: {
  target: ExportTarget;
  tool: ToolSpec;
  prompt: string;
  promptFile: string;
  projectPath: string;
  overrideRun?: LauncherRunOverride | null;
}): RunExecutionPlan {
  const adapter = getLaunchAdapter(input.target);
  const configured = input.overrideRun ?? getLauncherRunOverride(input.target);
  const strategy = configured?.mode ?? adapter.run_strategy;

  if (strategy === "stdin") {
    return {
      supported: true,
      strategy,
      command: input.tool.command,
      args: input.tool.args,
      prompt: input.prompt
    };
  }
  if (strategy === "args") {
    const tpl = configured?.args_template ?? [];
    if (tpl.length === 0) {
      return {
        supported: false,
        strategy,
        command: input.tool.command,
        args: input.tool.args,
        prompt: input.prompt,
        reason: `Target '${input.target}' args run strategy requires launchers.${input.target}.run.args_template in openteam.yaml.`
      };
    }
    const values = {
      prompt: input.prompt,
      prompt_file: input.promptFile,
      project: input.projectPath
    };
    return {
      supported: true,
      strategy,
      command: input.tool.command,
      args: [...input.tool.args, ...tpl.map((t) => fillTemplate(t, values))],
      prompt: input.prompt
    };
  }
  return {
    supported: false,
    strategy: "manual",
    command: input.tool.command,
    args: input.tool.args,
    prompt: input.prompt,
    reason:
      `Target '${input.target}' does not support stdin run injection by default.` +
      ` Use \`openteam start --target ${input.target}\` without --run, then paste START_PROMPT manually.`,
    manual_hint: configured?.manual_hint ?? adapter.manual_hint
  };
}

export function executeRunExecutionPlan(plan: RunExecutionPlan, cwd: string): SpawnSyncReturns<string> {
  if (!plan.supported) {
    throw new Error(plan.reason ?? "unsupported run execution plan");
  }
  if (plan.strategy === "stdin") {
    return spawnSync(plan.command, plan.args, {
      cwd,
      stdio: ["pipe", "inherit", "inherit"],
      input: `${plan.prompt}\n`,
      encoding: "utf8"
    });
  }
  return spawnSync(plan.command, plan.args, {
    cwd,
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

export function assertRunModeSupported(target: ExportTarget, runMode: boolean): void {
  if (!runMode) {
    return;
  }
  const plan = resolveRunExecutionPlan({
    target,
    tool: resolveToolSpec(target),
    prompt: "",
    promptFile: "",
    projectPath: process.cwd()
  });
  if (!plan.supported) {
    throw new Error(plan.reason ?? `Target '${target}' cannot run in --run mode.`);
  }
}

