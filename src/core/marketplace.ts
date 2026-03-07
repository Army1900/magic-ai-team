import fs from "node:fs";
import path from "node:path";
import {
  ensureDir,
  fileExists,
  loadOpenTeamConfig,
  resolveHomeOpenTeamConfigPath,
  writeYamlFile
} from "./config";
import { OpenTeamConfig } from "./types";

const DEFAULT_CONFIG: OpenTeamConfig = {
  version: "1.0",
  ui: {
    theme: "nord",
    color: true
  },
  preferences: {
    last_target: "claude",
    last_no_start: false,
    last_locale: "en"
  },
  current_provider: "openai",
  providers: {
    openai: {
      base_url: "https://api.openai.com/v1",
      api_key_env: "OPENAI_API_KEY",
      models: {
        default: "gpt-5-mini",
        planner: "gpt-5",
        optimizer: "gpt-5-mini",
        exporter_mapper: "gpt-5-mini"
      }
    },
    anthropic: {
      base_url: "https://api.anthropic.com",
      api_key_env: "ANTHROPIC_API_KEY",
      models: {
        default: "claude-sonnet-4",
        planner: "claude-sonnet-4",
        optimizer: "claude-sonnet-4",
        exporter_mapper: "claude-sonnet-4"
      }
    }
  },
  marketplaces: [
    {
      id: "official",
      kind: "official",
      url: "https://registry.openteam.dev",
      enabled: true
    }
  ],
  resolution_policy: {
    source_priority: ["private", "official", "github", "ai-generated"],
    allow_ai_generated: true,
    min_trust_score: 0.7
  }
};

export function loadOrCreateOpenTeamConfig(configPath = resolveHomeOpenTeamConfigPath()): OpenTeamConfig {
  if (!fileExists(configPath)) {
    ensureDir(path.dirname(path.resolve(configPath)));
    writeYamlFile(configPath, DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
  return loadOpenTeamConfig(configPath);
}

export function saveOpenTeamConfig(config: OpenTeamConfig, configPath = resolveHomeOpenTeamConfigPath()): void {
  ensureDir(path.dirname(path.resolve(configPath)));
  writeYamlFile(configPath, config);
}

export function addMarketplace(
  config: OpenTeamConfig,
  entry: { id: string; kind: string; url: string; enabled?: boolean }
): boolean {
  const existed = config.marketplaces.some((m) => m.id === entry.id || m.url === entry.url);
  if (existed) {
    return false;
  }
  config.marketplaces.push({
    id: entry.id,
    kind: entry.kind,
    url: entry.url,
    enabled: entry.enabled ?? true
  });
  return true;
}

export function removeMarketplace(config: OpenTeamConfig, id: string): boolean {
  const before = config.marketplaces.length;
  config.marketplaces = config.marketplaces.filter((m) => m.id !== id);
  return config.marketplaces.length < before;
}

export function setMarketplaceEnabled(config: OpenTeamConfig, id: string, enabled: boolean): boolean {
  const found = config.marketplaces.find((m) => m.id === id);
  if (!found) {
    return false;
  }
  found.enabled = enabled;
  return true;
}

export function syncMarketplaces(config: OpenTeamConfig, cacheDir = ".openteam/cache"): string {
  ensureDir(cacheDir);
  const index = {
    synced_at: new Date().toISOString(),
    sources: config.marketplaces.filter((m) => m.enabled),
    note: "This is a local index placeholder for marketplace metadata sync."
  };
  const outPath = path.resolve(cacheDir, "marketplaces.json");
  fs.writeFileSync(outPath, JSON.stringify(index, null, 2), "utf8");
  return outPath;
}
