import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bootstrapRuntimeEnvironment } from "../core/bootstrap";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run("bootstrapRuntimeEnvironment initializes home config template", () => {
  const tempProject = fs.mkdtempSync(path.join(os.tmpdir(), "openteam-bootstrap-project-"));
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "openteam-bootstrap-home-"));
  const prevHome = process.env.OPENTEAM_HOME;
  const prevCwd = process.cwd();
  process.env.OPENTEAM_HOME = tempHome;
  process.chdir(tempProject);
  try {
    const result = bootstrapRuntimeEnvironment();
    assert.equal(fs.existsSync(path.join(tempHome, "teams")), true);
    assert.equal(fs.existsSync(path.join(tempHome, "openteam.yaml")), true);
    assert.equal(fs.existsSync(path.join(tempProject, ".openteam", "openteam.yaml")), false);
    assert.equal(result.created_home_config, true);
  } finally {
    if (typeof prevHome === "undefined") delete process.env.OPENTEAM_HOME;
    else process.env.OPENTEAM_HOME = prevHome;
    process.chdir(prevCwd);
    fs.rmSync(tempProject, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});
