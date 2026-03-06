import fs from "node:fs";
import path from "node:path";
import { ensureOpenTeamHome, getOpenTeamHome, getTeamDirByName, teamSlug } from "./home";
import { defaultTeamTemplate } from "./templates";
import { writeYamlFile } from "./config";
import { TeamConfig } from "./types";

export interface RegistryEntry {
  name: string;
  slug: string;
  team_file: string;
  team_dir: string;
  goal: string;
  created_at: string;
  updated_at: string;
}

export interface TeamRegistry {
  version: "1.0";
  current_team_slug?: string;
  teams: RegistryEntry[];
}

function registryPath(): string {
  return path.join(getOpenTeamHome(), "registry.json");
}

function nowIso(): string {
  return new Date().toISOString();
}

function defaultRegistry(): TeamRegistry {
  return {
    version: "1.0",
    teams: []
  };
}

export function loadRegistry(): TeamRegistry {
  ensureOpenTeamHome();
  const filePath = registryPath();
  if (!fs.existsSync(filePath)) {
    const reg = defaultRegistry();
    fs.writeFileSync(filePath, JSON.stringify(reg, null, 2), "utf8");
    return reg;
  }
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as TeamRegistry;
}

export function saveRegistry(registry: TeamRegistry): void {
  ensureOpenTeamHome();
  fs.writeFileSync(registryPath(), JSON.stringify(registry, null, 2), "utf8");
}

function contextDocsForTeam(teamDir: string): string[] {
  const docsDir = path.join(teamDir, "docs", "team");
  fs.mkdirSync(docsDir, { recursive: true });

  const docs: Array<{ file: string; content: string }> = [
    {
      file: "culture.md",
      content: "# Team Culture\n\n- User outcomes first\n- Clarity over complexity\n- Reversible changes by default\n"
    },
    {
      file: "communication-style.md",
      content: "# Communication Style\n\n- Direct and concise\n- State assumptions explicitly\n- Report risks early\n"
    },
    {
      file: "work-rhythm.md",
      content: "# Work Rhythm\n\n- Weekly planning\n- Daily progress check\n- Small and frequent releases\n"
    },
    {
      file: "collaboration-rules.md",
      content: "# Collaboration Rules\n\n- Clear input/output contracts\n- Evaluator reviews before release\n- Policy guard blocks unsafe runs\n"
    },
    {
      file: "risk-policy.md",
      content: "# Risk Policy\n\n- High-risk resources require explicit approval\n- Low-trust skills are blocked by default\n"
    }
  ];

  const fullPaths: string[] = [];
  for (const d of docs) {
    const fullPath = path.join(docsDir, d.file);
    if (!fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, d.content, "utf8");
    }
    fullPaths.push(fullPath);
  }
  return fullPaths;
}

function materializeTeamConfig(name: string, goal: string, teamDir: string): TeamConfig {
  const cfg = defaultTeamTemplate(name, goal);
  cfg.context_docs = contextDocsForTeam(teamDir);
  cfg.observability.store.runs_dir = path.join(teamDir, "runs");
  cfg.observability.store.reports_dir = path.join(teamDir, "reports");
  return cfg;
}

export function createTeamInRegistry(name: string, goal: string, force = false): RegistryEntry {
  const registry = loadRegistry();
  const slug = teamSlug(name);
  const existing = registry.teams.find((t) => t.slug === slug);
  if (existing && !force) {
    throw new Error(`Team already exists: ${name} (${slug})`);
  }

  const teamDir = getTeamDirByName(name);
  fs.mkdirSync(teamDir, { recursive: true });
  const teamFile = path.join(teamDir, "team.yaml");
  const cfg = materializeTeamConfig(name, goal, teamDir);
  writeYamlFile(teamFile, cfg);

  const entry: RegistryEntry = {
    name,
    slug,
    team_file: teamFile,
    team_dir: teamDir,
    goal,
    created_at: existing?.created_at ?? nowIso(),
    updated_at: nowIso()
  };

  registry.teams = registry.teams.filter((t) => t.slug !== slug);
  registry.teams.push(entry);
  if (!registry.current_team_slug) {
    registry.current_team_slug = slug;
  }
  saveRegistry(registry);
  return entry;
}

export function listRegistryTeams(): TeamRegistry {
  return loadRegistry();
}

export function useRegistryTeam(nameOrSlug: string): RegistryEntry {
  const registry = loadRegistry();
  const slug = teamSlug(nameOrSlug);
  const entry = registry.teams.find((t) => t.slug === slug || t.name === nameOrSlug);
  if (!entry) {
    throw new Error(`Team not found: ${nameOrSlug}`);
  }
  registry.current_team_slug = entry.slug;
  saveRegistry(registry);
  return entry;
}

export function getCurrentTeamEntry(): RegistryEntry | null {
  const registry = loadRegistry();
  if (!registry.current_team_slug) {
    return null;
  }
  return registry.teams.find((t) => t.slug === registry.current_team_slug) ?? null;
}

export function findRegistryTeam(nameOrSlug: string): RegistryEntry | null {
  const registry = loadRegistry();
  const slug = teamSlug(nameOrSlug);
  return registry.teams.find((t) => t.slug === slug || t.name === nameOrSlug) ?? null;
}
