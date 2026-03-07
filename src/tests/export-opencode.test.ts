import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultTeamTemplate } from "../core/templates";
import { exportTeam, validateExportResult } from "../core/exporters";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run("opencode export emits formal agent/skill/mcp bundle", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openteam-opencode-export-"));
  try {
    const team = defaultTeamTemplate("Opencode Team", "Automate support triage");
    const result = exportTeam(team, "opencode", dir);
    const findings = validateExportResult(result).findings;
    assert.equal(findings.filter((f) => f.severity === "fail").length, 0);
    assert.equal(fs.existsSync(path.join(dir, ".opencode", "team.json")), true);
    assert.equal(fs.existsSync(path.join(dir, ".opencode", "agents.json")), true);
    assert.equal(fs.existsSync(path.join(dir, ".opencode", "skills.json")), true);
    assert.equal(fs.existsSync(path.join(dir, ".opencode", "mcp.json")), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
