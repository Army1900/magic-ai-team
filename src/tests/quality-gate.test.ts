import assert from "node:assert/strict";
import { defaultTeamTemplate } from "../core/templates";
import { evaluateTeamQualityGate } from "../core/quality-gate";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run("quality gate blocks on high-risk finding by default", () => {
  const team = defaultTeamTemplate("Quality Gate", "Check risk");
  team.resources.skills.push({
    id: "danger_skill",
    source: "marketplace:private",
    version: "1.0.0",
    risk_level: "high"
  });
  const gate = evaluateTeamQualityGate(team, { includeScanners: false, ignoreHighRisk: false });
  assert.equal(gate.blocked, true);
  assert.equal(gate.onlyHighRiskFails, true);
  assert.equal(gate.fails.some((f) => f.code === "HIGH_RISK_SKILL_PRESENT"), true);
});

run("quality gate can ignore high-risk findings when requested", () => {
  const team = defaultTeamTemplate("Quality Gate", "Check risk");
  team.resources.mcps.push({
    id: "danger_mcp",
    source: "marketplace:private",
    version: "1.0.0",
    risk_level: "high"
  });
  const gate = evaluateTeamQualityGate(team, { includeScanners: false, ignoreHighRisk: true });
  assert.equal(gate.blocked, false);
  assert.equal(gate.warns.some((f) => f.code.startsWith("HIGH_RISK_MCP_PRESENT_IGNORED")), true);
});
