import { TeamConfig } from "./types";

function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function defaultTeamTemplate(name: string, goal: string): TeamConfig {
  const teamId = `team_${slug(name) || "default"}`;

  return {
    version: "1.0",
    team: {
      id: teamId,
      name,
      goal,
      kpis: [
        { name: "success_rate", target: ">=0.85" },
        { name: "p95_latency_ms", target: "<=12000" },
        { name: "cost_per_run_usd", target: "<=1.5" }
      ]
    },
    context_docs: [
      "docs/team/culture.md",
      "docs/team/communication-style.md",
      "docs/team/work-rhythm.md",
      "docs/team/collaboration-rules.md",
      "docs/team/risk-policy.md"
    ],
    control_plane: {
      enabled: true,
      manager_agents: [
        { id: "planner", type: "planner", model: "openai:gpt-5" },
        { id: "broker", type: "broker", model: "openai:gpt-5-mini" },
        { id: "evaluator", type: "evaluator", model: "openai:gpt-5-mini" },
        { id: "optimizer", type: "optimizer", model: "openai:gpt-5-mini" },
        { id: "policy_guard", type: "policy_guard", model: "openai:gpt-5-mini" }
      ]
    },
    execution_plane: {
      agents: [
        {
          id: "researcher",
          role: "Collect and structure information",
          risk_level: "low",
          model: {
            primary: "openai:gpt-5-mini",
            fallback: ["anthropic:claude-sonnet-4"]
          },
          skills: ["web_research", "summarization"],
          mcps: ["browser-mcp"],
          input_contract: "task",
          output_contract: "research_notes"
        },
        {
          id: "executor",
          role: "Produce final output",
          risk_level: "medium",
          model: {
            primary: "openai:gpt-5",
            fallback: ["openai:gpt-5-mini"]
          },
          skills: ["planning", "tool_calling"],
          mcps: ["github-mcp", "notion-mcp"],
          input_contract: "research_notes",
          output_contract: "deliverable"
        }
      ]
    },
    resources: {
      skills: [
        {
          id: "web_research",
          source: "marketplace:official",
          version: "1.0.0",
          license: "MIT",
          trust_score: 0.92,
          risk_level: "low"
        },
        {
          id: "summarization",
          source: "marketplace:official",
          version: "1.0.0",
          license: "MIT",
          trust_score: 0.9,
          risk_level: "low"
        }
      ],
      mcps: [
        {
          id: "browser-mcp",
          source: "marketplace:official",
          version: "1.0.0",
          auth: "none",
          permissions: [],
          risk_level: "low"
        },
        {
          id: "github-mcp",
          source: "marketplace:github",
          version: "1.0.0",
          auth: "oauth2",
          permissions: ["repo:read"],
          risk_level: "medium"
        },
        {
          id: "notion-mcp",
          source: "marketplace:official",
          version: "1.0.0",
          auth: "oauth2",
          permissions: ["page:read", "page:write"],
          risk_level: "medium"
        }
      ]
    },
    policies: {
      budget: { max_cost_usd_per_run: 1.5 },
      latency: { p95_ms_max: 12000 },
      security: {
        allow_high_risk_mcp: false,
        allow_high_risk_skill: false,
        allow_high_risk_agent: false,
        min_skill_trust_score: 0.7,
        require_human_approval_for_prod: true
      }
    },
    observability: {
      trace: true,
      log_level: "info",
      store: {
        runs_dir: ".openteam/runs",
        reports_dir: ".openteam/reports"
      }
    },
    optimization: {
      auto_optimize: false,
      strategy_order: ["model_tuning", "resource_replacement", "topology_change"]
    },
    fallback: {
      on_model_error: "switch_fallback_model",
      on_mcp_error: "disable_mcp_and_retry",
      on_budget_exceed: "downgrade_model"
    }
  };
}
