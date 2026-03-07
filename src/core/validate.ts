import Ajv from "ajv";
import { teamSchema } from "./schema";
import { TeamConfig } from "./types";

const ajv = new Ajv({ allErrors: true, strict: false });
const validateFn = ajv.compile(teamSchema);

export type SchemaStrictMode = "off" | "warn" | "fail";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  strict_mode: SchemaStrictMode;
}

function resolveStrictMode(mode?: SchemaStrictMode): SchemaStrictMode {
  if (mode) return mode;
  const raw = (process.env.OPENTEAM_SCHEMA_STRICT ?? "warn").trim().toLowerCase();
  if (raw === "off" || raw === "warn" || raw === "fail") return raw;
  return "warn";
}

function hasKnownProviderPrefix(model: string): boolean {
  const provider = (model.split(":")[0] ?? "").toLowerCase();
  return provider === "openai" || provider === "anthropic";
}

function strictWarnings(config: TeamConfig): string[] {
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const agent of config.execution_plane.agents) {
    if (seen.has(agent.id)) {
      warnings.push(`duplicate execution agent id: ${agent.id}`);
    }
    seen.add(agent.id);
    if (!hasKnownProviderPrefix(agent.model.primary)) {
      warnings.push(`execution agent '${agent.id}' primary model should include provider prefix (e.g. openai:model)`);
    }
    for (const fallback of agent.model.fallback ?? []) {
      if (!hasKnownProviderPrefix(fallback)) {
        warnings.push(`execution agent '${agent.id}' fallback model should include provider prefix: ${fallback}`);
      }
    }
  }
  for (const manager of config.control_plane.manager_agents) {
    if (!hasKnownProviderPrefix(manager.model)) {
      warnings.push(`manager '${manager.id}' model should include provider prefix: ${manager.model}`);
    }
  }
  return warnings;
}

export function validateTeamConfig(config: TeamConfig, mode?: SchemaStrictMode): ValidationResult {
  const strictMode = resolveStrictMode(mode);
  const valid = validateFn(config);
  const errors = valid
    ? []
    : (validateFn.errors ?? []).map((e) => {
        const location = e.instancePath || "/";
        return `${location} ${e.message ?? "invalid"}`;
      });
  const warnings = strictMode === "off" ? [] : strictWarnings(config);
  if (strictMode === "fail") {
    errors.push(...warnings.map((w) => `[strict] ${w}`));
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: strictMode === "fail" ? [] : warnings,
    strict_mode: strictMode
  };
}
