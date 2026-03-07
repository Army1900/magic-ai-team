import assert from "node:assert/strict";
import { defaultTeamTemplate } from "../core/templates";
import { OpenTeamConfig } from "../core/types";
import {
  attachRecommendedResources,
  recommendMarketplaceCandidates
} from "../core/resource-recommendation";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const openTeamConfig: OpenTeamConfig = {
  version: "1.0",
  marketplaces: [
    { id: "official", kind: "official", url: "https://registry.openteam.dev", enabled: true },
    { id: "github", kind: "github", url: "https://github.com/topics/openteam-skill", enabled: true }
  ],
  resolution_policy: {
    source_priority: ["official", "github"],
    allow_ai_generated: true,
    min_trust_score: 0.7
  }
};

run("recommendMarketplaceCandidates returns triage-related candidates", () => {
  const team = defaultTeamTemplate("Support Team", "Automate support triage");
  const candidates = recommendMarketplaceCandidates(
    {
      teamName: "Support Team",
      problem: "Automate support ticket triage",
      outcome: "Reduce response time",
      constraints: "No special constraints"
    },
    team,
    openTeamConfig,
    { skills: 3, mcps: 3 }
  );

  assert.equal(candidates.length > 0, true);
  assert.equal(candidates.some((c) => c.id === "support_ticket_classifier"), true);
});

run("attachRecommendedResources appends selected resources and binds to agents", () => {
  const team = defaultTeamTemplate("QA Team", "Improve QA and release safety");
  const candidates = recommendMarketplaceCandidates(
    {
      teamName: "QA Team",
      problem: "Improve release safety and defect triage",
      outcome: "Reduce defects",
      constraints: "No special constraints"
    },
    team,
    openTeamConfig,
    { skills: 2, mcps: 2 }
  );

  const selected = candidates.slice(0, 2);
  const attached = attachRecommendedResources(team, selected);

  assert.equal(attached.skillsAdded.length + attached.mcpsAdded.length > 0, true);
  for (const skillId of attached.skillsAdded) {
    assert.equal(team.resources.skills.some((s) => s.id === skillId), true);
  }
  for (const mcpId of attached.mcpsAdded) {
    assert.equal(team.resources.mcps.some((m) => m.id === mcpId), true);
  }
});
