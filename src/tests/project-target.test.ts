import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readLastExportTarget, resolveProjectTarget } from "../core/project-target";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function withTempDir(fn: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openteam-target-"));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

run("readLastExportTarget returns null without manifest", () => {
  withTempDir((dir) => {
    assert.equal(readLastExportTarget(dir), null);
  });
});

run("readLastExportTarget reads valid target from manifest", () => {
  withTempDir((dir) => {
    const manifestDir = path.join(dir, ".openteam", "exports");
    fs.mkdirSync(manifestDir, { recursive: true });
    fs.writeFileSync(path.join(manifestDir, "manifest.json"), JSON.stringify({ target: "codex" }), "utf8");
    assert.equal(readLastExportTarget(dir), "codex");
  });
});

run("resolveProjectTarget prefers explicit target", () => {
  withTempDir((dir) => {
    assert.equal(resolveProjectTarget(dir, "openclaw"), "openclaw");
  });
});

run("resolveProjectTarget falls back to manifest target", () => {
  withTempDir((dir) => {
    const manifestDir = path.join(dir, ".openteam", "exports");
    fs.mkdirSync(manifestDir, { recursive: true });
    fs.writeFileSync(path.join(manifestDir, "manifest.json"), JSON.stringify({ target: "aider" }), "utf8");
    assert.equal(resolveProjectTarget(dir), "aider");
  });
});

run("resolveProjectTarget falls back to default when manifest invalid", () => {
  withTempDir((dir) => {
    const manifestDir = path.join(dir, ".openteam", "exports");
    fs.mkdirSync(manifestDir, { recursive: true });
    fs.writeFileSync(path.join(manifestDir, "manifest.json"), JSON.stringify({ target: "invalid" }), "utf8");
    assert.equal(resolveProjectTarget(dir), "claude");
  });
});
