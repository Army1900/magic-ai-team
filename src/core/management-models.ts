import { loadOpenTeamConfig } from "./config";

export type ManagementRole = "planner" | "optimizer" | "exporter_mapper";

const DEFAULTS: Record<ManagementRole, string> = {
  planner: "openai:gpt-5",
  optimizer: "openai:gpt-5-mini",
  exporter_mapper: "openai:gpt-5-mini"
};

function withProvider(provider: string, model: string): string {
  if (model.includes(":")) return model;
  return `${provider}:${model}`;
}

export function resolveManagementModel(role: ManagementRole, cliOverride?: string): string {
  if (cliOverride?.trim()) {
    return cliOverride.trim();
  }

  try {
    const cfg = loadOpenTeamConfig("openteam.yaml");
    const currentProvider = (cfg.current_provider || "openai").toLowerCase();
    const providerCfg =
      currentProvider === "anthropic"
        ? cfg.providers?.anthropic
        : cfg.providers?.openai;
    const roleModel = providerCfg?.models?.[role]?.trim();
    const defaultModel = providerCfg?.models?.default?.trim();
    if (roleModel) {
      return withProvider(currentProvider, roleModel);
    }
    if (defaultModel) {
      return withProvider(currentProvider, defaultModel);
    }
  } catch {
    // fallback to default
  }

  return DEFAULTS[role];
}
