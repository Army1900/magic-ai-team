import assert from "node:assert/strict";
import { defaultTeamTemplate } from "../core/templates";
import { buildRuleBasedTopology, parseAiTopology } from "../core/dynamic-topology";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run("buildRuleBasedTopology includes team_lead", () => {
  const team = defaultTeamTemplate("Support Team", "Automate support triage");
  const topology = buildRuleBasedTopology(
    {
      problem: "Automate support ticket triage",
      outcome: "Reduce response time",
      constraints: "No special constraints"
    },
    team
  );
  assert.equal(topology.agents.some((a) => a.id === "team_lead"), true);
  assert.equal(topology.lead_id, "team_lead");
});

run("parseAiTopology falls back on invalid payload", () => {
  const team = defaultTeamTemplate("QA Team", "Improve QA and release safety");
  const fallback = buildRuleBasedTopology(
    {
      problem: "Improve QA and release safety",
      outcome: "Reduce defects",
      constraints: "No special constraints"
    },
    team
  );
  const parsed = parseAiTopology("not-json", fallback);
  assert.equal(parsed.source, "rule");
  assert.equal(parsed.agents.length, fallback.agents.length);
});

run("buildRuleBasedTopology matches cyber incident template", () => {
  const team = defaultTeamTemplate("SOC Team", "Respond security incidents");
  const topology = buildRuleBasedTopology(
    {
      problem: "SOC incident response and threat triage",
      outcome: "Contain incidents quickly",
      constraints: "Strict security and compliance"
    },
    team
  );
  assert.equal(topology.lead_id, "incident_commander");
  assert.equal(topology.agents.some((a) => a.id === "detection_analyst"), true);
});

run("buildRuleBasedTopology matches finance risk template", () => {
  const team = defaultTeamTemplate("Risk Team", "Fraud risk control");
  const topology = buildRuleBasedTopology(
    {
      problem: "Build AML and fraud risk control workflow",
      outcome: "Reduce suspicious transaction misses",
      constraints: "Strict compliance"
    },
    team
  );
  assert.equal(topology.lead_id, "risk_lead");
  assert.equal(topology.agents.some((a) => a.id === "transaction_monitor"), true);
});

run("buildRuleBasedTopology matches legal contract template", () => {
  const team = defaultTeamTemplate("Legal Team", "Contract review");
  const topology = buildRuleBasedTopology(
    {
      problem: "Review contract clauses and compliance obligations",
      outcome: "Produce negotiation brief",
      constraints: "Legal compliance"
    },
    team
  );
  assert.equal(topology.lead_id, "legal_lead");
  assert.equal(topology.agents.some((a) => a.id === "clause_analyst"), true);
});
