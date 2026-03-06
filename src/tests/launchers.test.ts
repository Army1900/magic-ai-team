import assert from "node:assert/strict";
import { EXPORT_TARGETS } from "../core/targets";
import {
  assertRunModeSupported,
  getLaunchAdapter,
  getLauncherHealth,
  listLauncherHealth,
  parseToolCommand,
  resolveRunExecutionPlan,
  resolveToolSpec
} from "../core/launchers";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run("getLaunchAdapter is defined for every export target", () => {
  for (const target of EXPORT_TARGETS) {
    const adapter = getLaunchAdapter(target);
    assert.equal(adapter.target, target);
    assert.equal(adapter.command.length > 0, true);
  }
});

run("parseToolCommand splits command and args", () => {
  const tool = parseToolCommand("claude --project .");
  assert.equal(tool.command, "claude");
  assert.deepEqual(tool.args, ["--project", "."]);
});

run("parseToolCommand rejects empty input", () => {
  assert.throws(() => parseToolCommand("   "), /Empty --tool-cmd\./);
});

run("resolveToolSpec returns override command when provided", () => {
  const tool = resolveToolSpec("claude", "custom --flag");
  assert.equal(tool.command, "custom");
  assert.deepEqual(tool.args, ["--flag"]);
});

run("resolveToolSpec returns adapter default by target", () => {
  const tool = resolveToolSpec("codex");
  assert.equal(tool.command, "codex");
  assert.deepEqual(tool.args, []);
});

run("getLauncherHealth returns shape for one target", () => {
  const row = getLauncherHealth("claude");
  assert.equal(row.target, "claude");
  assert.equal(typeof row.available, "boolean");
  assert.equal(row.command.length > 0, true);
});

run("listLauncherHealth returns one row per target", () => {
  const rows = listLauncherHealth();
  assert.equal(rows.length, EXPORT_TARGETS.length);
});

run("assertRunModeSupported allows run mode for claude", () => {
  assert.doesNotThrow(() => assertRunModeSupported("claude", true));
});

run("assertRunModeSupported blocks run mode for continue", () => {
  assert.throws(() => assertRunModeSupported("continue", true), /does not support stdin run injection/);
});

run("resolveRunExecutionPlan supports args-template override for continue", () => {
  const plan = resolveRunExecutionPlan({
    target: "continue",
    tool: { command: "continue", args: [] },
    prompt: "hello",
    promptFile: "/tmp/prompt.md",
    projectPath: "/tmp/project",
    overrideRun: {
      mode: "args",
      args_template: ["run", "--prompt-file", "{prompt_file}"]
    }
  });
  assert.equal(plan.supported, true);
  assert.equal(plan.strategy, "args");
  assert.deepEqual(plan.args, ["run", "--prompt-file", "/tmp/prompt.md"]);
});

run("resolveRunExecutionPlan returns manual unsupported by default for continue", () => {
  const plan = resolveRunExecutionPlan({
    target: "continue",
    tool: { command: "continue", args: [] },
    prompt: "hello",
    promptFile: "/tmp/prompt.md",
    projectPath: "/tmp/project",
    overrideRun: null
  });
  assert.equal(plan.supported, false);
  assert.equal(plan.strategy, "manual");
});
