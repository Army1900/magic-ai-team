import assert from "node:assert/strict";
import { defaultTeamTemplate } from "../core/templates";
import { applyHighRiskOverride, evaluateTeamQuality } from "../core/team-quality";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run("evaluateTeamQuality marks high-risk resources as fail by default", () => {
  const team = defaultTeamTemplate("Quality Team", "Check risk");
  team.resources.skills.push({
    id: "danger_skill",
    source: "marketplace:private",
    version: "1.0.0",
    risk_level: "high"
  });
  const report = evaluateTeamQuality(team);
  assert.equal(report.findings.some((f) => f.code === "HIGH_RISK_SKILL_PRESENT" && f.severity === "fail"), true);
});

run("applyHighRiskOverride downgrades high-risk fail to warn", () => {
  const team = defaultTeamTemplate("Quality Team", "Check risk");
  team.resources.mcps.push({
    id: "danger_mcp",
    source: "marketplace:private",
    version: "1.0.0",
    risk_level: "high"
  });
  const report = evaluateTeamQuality(team);
  const overridden = applyHighRiskOverride(report.findings, true);
  assert.equal(overridden.some((f) => f.code.startsWith("HIGH_RISK_MCP_PRESENT_IGNORED") && f.severity === "warn"), true);
});

