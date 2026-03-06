import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initGoRecovery, loadGoRecovery, saveGoRecovery } from "../core/go-recovery";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function withTempHome(fn: (home: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openteam-go-recovery-"));
  const prev = process.env.OPENTEAM_HOME;
  process.env.OPENTEAM_HOME = dir;
  try {
    fn(dir);
  } finally {
    if (typeof prev === "undefined") delete process.env.OPENTEAM_HOME;
    else process.env.OPENTEAM_HOME = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

run("saveGoRecovery and loadGoRecovery roundtrip", () => {
  withTempHome(() => {
    const state = initGoRecovery({
      target: "claude",
      project: "D:/project",
      run: false,
      should_start: true
    });
    state.artifacts.team_slug = "a";
    state.artifacts.team_file = "team.yaml";
    saveGoRecovery(state);
    const loaded = loadGoRecovery();
    assert.equal(Boolean(loaded), true);
    assert.equal(loaded?.options.target, "claude");
    assert.equal(loaded?.artifacts.team_slug, "a");
  });
});

