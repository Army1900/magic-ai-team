import assert from "node:assert/strict";
import { applyDefaultGoArgs } from "../core/default-command";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run("applyDefaultGoArgs appends go for empty args", () => {
  const argv = ["node", "openteam"];
  assert.deepEqual(applyDefaultGoArgs(argv), ["node", "openteam", "go"]);
});

run("applyDefaultGoArgs prepends go for option-only invocation", () => {
  const argv = ["node", "openteam", "--project", "D:/p"];
  assert.deepEqual(applyDefaultGoArgs(argv), ["node", "openteam", "go", "--project", "D:/p"]);
});

run("applyDefaultGoArgs keeps help/version as-is", () => {
  const helpArgv = ["node", "openteam", "--help"];
  const versionArgv = ["node", "openteam", "-V"];
  assert.deepEqual(applyDefaultGoArgs(helpArgv), helpArgv);
  assert.deepEqual(applyDefaultGoArgs(versionArgv), versionArgv);
});

run("applyDefaultGoArgs keeps explicit command as-is", () => {
  const argv = ["node", "openteam", "export", "--target", "codex"];
  assert.deepEqual(applyDefaultGoArgs(argv), argv);
});
