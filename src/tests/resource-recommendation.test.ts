import assert from "node:assert/strict";
import { defaultTeamTemplate } from "../core/templates";
import { OpenTeamConfig, TeamConfig } from "../core/types";
import {
  attachRecommendedResources,
  recommendMarketplaceCandidates,
  recommendMarketplaceCandidatesDetailed
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
  const hasBoundSkill = attached.skillsAdded.some((skillId) => team.execution_plane.agents.some((a) => a.skills.includes(skillId)));
  const hasBoundMcp = attached.mcpsAdded.some((mcpId) => team.execution_plane.agents.some((a) => a.mcps.includes(mcpId)));
  assert.equal(hasBoundSkill || hasBoundMcp, true);
});

run("attachRecommendedResources binds resources to best-fit agent by role context", () => {
  const team: TeamConfig = defaultTeamTemplate("Custom Team", "Handle support and integrations");
  team.execution_plane.agents = [
    {
      id: "triage_analyst",
      role: "Own ticket triage and issue classification",
      risk_level: "low",
      model: { primary: "openai:gpt-5-mini", fallback: [] },
      skills: [],
      mcps: [],
      input_contract: "ticket_queue",
      output_contract: "classified_tickets"
    },
    {
      id: "integration_executor",
      role: "Handle tool integration and external system actions",
      risk_level: "medium",
      model: { primary: "openai:gpt-5-mini", fallback: [] },
      skills: [],
      mcps: [],
      input_contract: "task_plan",
      output_contract: "execution_result"
    }
  ];
  team.resources.skills = [];
  team.resources.mcps = [];

  const selected = [
    {
      type: "skill" as const,
      id: "support_ticket_classifier",
      title: "Support Ticket Classifier",
      source: "marketplace:official",
      version: "1.0.0",
      license: "MIT",
      trust_score: 0.9,
      risk_level: "low",
      tags: ["support", "ticket", "triage"]
    },
    {
      type: "mcp" as const,
      id: "servicenow-mcp",
      title: "ServiceNow MCP",
      source: "marketplace:official",
      version: "1.0.0",
      auth: "oauth2",
      permissions: ["ticket:write"],
      risk_level: "medium",
      tags: ["integration", "tool", "ticket"]
    }
  ];
  const attached = attachRecommendedResources(team, selected, { domainKeywords: ["triage", "integration"] });
  assert.equal(attached.skillsAdded.includes("support_ticket_classifier"), true);
  assert.equal(attached.mcpsAdded.includes("servicenow-mcp"), true);
  assert.equal(team.execution_plane.agents[0].skills.includes("support_ticket_classifier"), true);
  assert.equal(team.execution_plane.agents[1].mcps.includes("servicenow-mcp"), true);
});

run("recommendMarketplaceCandidatesDetailed prefers education-domain resources and provides reasons", () => {
  const team = defaultTeamTemplate("Tutor Team", "Help students improve scores");
  team.resources.skills = [];
  team.resources.mcps = [];
  const detail = recommendMarketplaceCandidatesDetailed(
    {
      teamName: "家教团队",
      problem: "我想弄一个家教团队帮学生提高成绩",
      outcome: "提升考试成绩",
      constraints: "预算有限"
    },
    team,
    openTeamConfig,
    { skills: 3, mcps: 2, allowHighRisk: false }
  );
  assert.equal(detail.domain, "education");
  assert.equal(detail.items.length > 0, true);
  const educationCore = new Set(["curriculum_planning", "lesson_authoring", "assessment_design", "pedagogy_review"]);
  assert.equal(detail.items.some((r) => educationCore.has(r.candidate.id)), true);
  assert.equal(detail.items.every((r) => r.reason.length > 0), true);
});

run("recommendMarketplaceCandidatesDetailed filters out high-risk by default", () => {
  const team = defaultTeamTemplate("Risk Team", "Risk workflow");
  team.resources.skills = [];
  team.resources.mcps = [];
  const detail = recommendMarketplaceCandidatesDetailed(
    {
      teamName: "Risk Team",
      problem: "finance risk policy and transaction review",
      outcome: "reduce fraud",
      constraints: "no special constraints"
    },
    team,
    openTeamConfig,
    { skills: 5, mcps: 3, allowHighRisk: false }
  );
  assert.equal(detail.blocked_high_risk_count > 0, true);
  assert.equal(detail.items.some((r) => (r.candidate.risk_level ?? "low") === "high"), false);
});
