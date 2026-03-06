import assert from "node:assert/strict";
import {
  EXPORT_TARGET_HELP,
  EXPORT_TARGETS,
  getDefaultToolCommand,
  isExportTarget,
  normalizeExportTarget,
  unsupportedTargetMessage
} from "../core/targets";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run("normalizeExportTarget accepts supported values (case-insensitive)", () => {
  assert.equal(normalizeExportTarget("claude"), "claude");
  assert.equal(normalizeExportTarget("CoDeX"), "codex");
  assert.equal(normalizeExportTarget("OPENHANDS"), "openhands");
});

run("normalizeExportTarget throws with stable message for unsupported value", () => {
  assert.throws(
    () => normalizeExportTarget("foo"),
    (err: unknown) => err instanceof Error && err.message === unsupportedTargetMessage()
  );
});

run("isExportTarget returns true only for supported targets", () => {
  assert.equal(isExportTarget("opencode"), true);
  assert.equal(isExportTarget("tabby"), true);
  assert.equal(isExportTarget(""), false);
  assert.equal(isExportTarget("other"), false);
});

run("getDefaultToolCommand maps one command per target", () => {
  for (const target of EXPORT_TARGETS) {
    assert.equal(getDefaultToolCommand(target).length > 0, true);
  }
  assert.equal(getDefaultToolCommand("claude"), "claude");
  assert.equal(getDefaultToolCommand("codex"), "codex");
  assert.equal(getDefaultToolCommand("openclaw"), "openclaw");
});

run("help text is consistent with supported targets", () => {
  assert.equal(EXPORT_TARGET_HELP, EXPORT_TARGETS.join("|"));
});
