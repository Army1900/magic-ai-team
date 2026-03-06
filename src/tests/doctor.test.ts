import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultTeamTemplate } from "../core/templates";
import { writeYamlFile } from "../core/config";
import { runDoctor } from "../core/doctor";

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openteam-doctor-"));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

run("runDoctor includes target checks when target is provided", () => {
  withTempDir((dir) => {
    const teamPath = path.join(dir, "team.yaml");
    writeYamlFile(teamPath, defaultTeamTemplate("Doc Team", "Automate support triage"));
    const checks = runDoctor(teamPath, path.join(dir, "openteam.yaml"), "claude");
    const names = new Set(checks.map((c) => c.name));
    assert.equal(names.has("target compatibility (claude)"), true);
    assert.equal(names.has("launcher (claude)"), true);
    assert.equal(names.has("run-mode support (claude)"), true);
  });
});

run("runDoctor fails when target is invalid", () => {
  withTempDir((dir) => {
    const teamPath = path.join(dir, "team.yaml");
    writeYamlFile(teamPath, defaultTeamTemplate("Doc Team", "Automate support triage"));
    const checks = runDoctor(teamPath, path.join(dir, "openteam.yaml"), "invalid-target");
    const invalid = checks.find((c) => c.name === "target option");
    assert.equal(Boolean(invalid), true);
    assert.equal(invalid?.status, "fail");
  });
});

