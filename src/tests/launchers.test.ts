import assert from "node:assert/strict";
import { EXPORT_TARGETS } from "../core/targets";
import { getLaunchAdapter, parseToolCommand, resolveToolSpec } from "../core/launchers";

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

