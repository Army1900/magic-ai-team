import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultTeamTemplate } from "../core/templates";
import { exportTeam, validateExportResult } from "../core/exporters";
import { EXPORT_TARGETS } from "../core/targets";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run("all targets emit formal agent/skill/mcp bundle", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openteam-formal-bundle-"));
  try {
    for (const target of EXPORT_TARGETS) {
      const out = path.join(root, target);
      fs.mkdirSync(out, { recursive: true });
      const team = defaultTeamTemplate(`Team-${target}`, "Automate support triage");
      const result = exportTeam(team, target, out);
      const targetDir = path.join(out, `.${target}`);
      assert.equal(fs.existsSync(path.join(targetDir, "agents.json")), true, `agents missing target=${target}`);
      assert.equal(fs.existsSync(path.join(targetDir, "skills.json")), true, `skills missing target=${target}`);
      assert.equal(fs.existsSync(path.join(targetDir, "mcp.json")), true, `mcp missing target=${target}`);
      const fails = validateExportResult(result).findings.filter((f) => f.severity === "fail");
      assert.equal(fails.length, 0, `validation fail target=${target}: ${fails.map((f)=>f.code).join(",")}`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
