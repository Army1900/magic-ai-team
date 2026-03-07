import assert from "node:assert/strict";
import { evaluateAgentQuality } from "../core/agent-quality";
import { defaultTeamTemplate } from "../core/templates";
import { RunArtifact } from "../core/types";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run("evaluateAgentQuality detects contract and risk issues", () => {
  const team = defaultTeamTemplate("Risk Team", "Review high risk tasks");
  team.policies.security.allow_high_risk_agent = false;
  team.policies.security.allow_high_risk_mcp = false;
  team.execution_plane.agents[0].risk_level = "high";
  team.execution_plane.agents[0].input_contract = "";
  team.execution_plane.agents[0].output_contract = "json_output";
  team.resources.mcps.push({
    id: "sensitive-mcp",
    source: "marketplace:private",
    version: "1.0.0",
    risk_level: "high"
  });
  team.execution_plane.agents[0].mcps = ["sensitive-mcp"];

  const artifact: RunArtifact = {
    run_id: "run_quality_1",
    created_at: new Date().toISOString(),
    mode: "run",
    task: "review",
    team_id: team.team.id,
    success: false,
    totals: {
      latency_ms: 100,
      estimated_tokens: 100,
      estimated_cost_usd: 0.001
    },
    steps: [
      {
        agent_id: team.execution_plane.agents[0].id,
        model: "openai:gpt-5-mini",
        status: "fail",
        latency_ms: 0,
        estimated_tokens: 0,
        estimated_cost_usd: 0,
        output_preview: "plain text"
      }
    ],
    failure_reason: "failed"
  };

  const report = evaluateAgentQuality(team, artifact);
  assert.equal(report.ok, false);
  assert.equal(report.findings.some((f) => f.code === "INPUT_CONTRACT_INVALID"), true);
  assert.equal(report.findings.some((f) => f.code === "HIGH_RISK_AGENT_BLOCKED"), true);
  assert.equal(report.findings.some((f) => f.code === "HIGH_RISK_MCP_BLOCKED"), true);
});

