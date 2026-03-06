import { JSONSchemaType } from "ajv";
import { TeamConfig } from "./types";

export const teamSchema: JSONSchemaType<TeamConfig> = {
  type: "object",
  additionalProperties: false,
  required: [
    "version",
    "team",
    "control_plane",
    "execution_plane",
    "resources",
    "policies",
    "observability",
    "optimization",
    "fallback"
  ],
  properties: {
    version: { type: "string" },
    team: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name", "goal", "kpis"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        goal: { type: "string" },
        kpis: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "target"],
            properties: {
              name: { type: "string" },
              target: { type: "string" }
            }
          }
        }
      }
    },
    context_docs: {
      type: "array",
      nullable: true,
      items: { type: "string" }
    },
    control_plane: {
      type: "object",
      additionalProperties: false,
      required: ["enabled", "manager_agents"],
      properties: {
        enabled: { type: "boolean" },
        manager_agents: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "type", "model"],
            properties: {
              id: { type: "string" },
              type: { type: "string" },
              model: { type: "string" }
            }
          }
        }
      }
    },
    execution_plane: {
      type: "object",
      additionalProperties: false,
      required: ["agents"],
      properties: {
        agents: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "id",
              "role",
              "model",
              "skills",
              "mcps",
              "input_contract",
              "output_contract"
            ],
            properties: {
              id: { type: "string" },
              role: { type: "string" },
              risk_level: { type: "string", nullable: true },
              model: {
                type: "object",
                additionalProperties: false,
                required: ["primary"],
                properties: {
                  primary: { type: "string" },
                  fallback: {
                    type: "array",
                    nullable: true,
                    items: { type: "string" }
                  }
                }
              },
              skills: { type: "array", items: { type: "string" } },
              mcps: { type: "array", items: { type: "string" } },
              input_contract: { type: "string" },
              output_contract: { type: "string" }
            }
          }
        }
      }
    },
    resources: {
      type: "object",
      additionalProperties: false,
      required: ["skills", "mcps"],
      properties: {
        skills: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "source", "version"],
            properties: {
              id: { type: "string" },
              source: { type: "string" },
              version: { type: "string" },
              license: { type: "string", nullable: true },
              trust_score: { type: "number", nullable: true },
              risk_level: { type: "string", nullable: true }
            }
          }
        },
        mcps: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "source", "version"],
            properties: {
              id: { type: "string" },
              source: { type: "string" },
              version: { type: "string" },
              auth: { type: "string", nullable: true },
              permissions: {
                type: "array",
                nullable: true,
                items: { type: "string" }
              },
              risk_level: { type: "string", nullable: true }
            }
          }
        }
      }
    },
    policies: {
      type: "object",
      additionalProperties: false,
      required: ["budget", "latency", "security"],
      properties: {
        budget: {
          type: "object",
          additionalProperties: false,
          required: ["max_cost_usd_per_run"],
          properties: {
            max_cost_usd_per_run: { type: "number" }
          }
        },
        latency: {
          type: "object",
          additionalProperties: false,
          required: ["p95_ms_max"],
          properties: {
            p95_ms_max: { type: "number" }
          }
        },
        security: {
          type: "object",
          additionalProperties: false,
          required: [
            "allow_high_risk_mcp",
            "allow_high_risk_skill",
            "allow_high_risk_agent",
            "require_human_approval_for_prod",
            "min_skill_trust_score"
          ],
          properties: {
            allow_high_risk_mcp: { type: "boolean" },
            allow_high_risk_skill: { type: "boolean" },
            allow_high_risk_agent: { type: "boolean" },
            require_human_approval_for_prod: { type: "boolean" },
            min_skill_trust_score: { type: "number" }
          }
        }
      }
    },
    observability: {
      type: "object",
      additionalProperties: false,
      required: ["trace", "log_level", "store"],
      properties: {
        trace: { type: "boolean" },
        log_level: { type: "string" },
        store: {
          type: "object",
          additionalProperties: false,
          required: ["runs_dir", "reports_dir"],
          properties: {
            runs_dir: { type: "string" },
            reports_dir: { type: "string" }
          }
        }
      }
    },
    optimization: {
      type: "object",
      additionalProperties: false,
      required: ["auto_optimize", "strategy_order"],
      properties: {
        auto_optimize: { type: "boolean" },
        strategy_order: {
          type: "array",
          items: { type: "string" }
        }
      }
    },
    fallback: {
      type: "object",
      additionalProperties: false,
      required: ["on_model_error", "on_mcp_error", "on_budget_exceed"],
      properties: {
        on_model_error: { type: "string" },
        on_mcp_error: { type: "string" },
        on_budget_exceed: { type: "string" }
      }
    }
  }
};
