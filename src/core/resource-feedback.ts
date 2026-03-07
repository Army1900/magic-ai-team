import fs from "node:fs";
import path from "node:path";
import { ensureOpenTeamHome } from "./home";
import { RunArtifact, TeamConfig } from "./types";

type FeedbackResourceType = "skill" | "mcp";

interface ResourceFeedbackItem {
  id: string;
  type: FeedbackResourceType;
  attached: number;
  runs: number;
  success_runs: number;
  total_cost_usd: number;
  total_tokens: number;
  last_used_at?: string;
}

interface ResourceFeedbackStore {
  version: "1";
  updated_at: string;
  items: Record<string, ResourceFeedbackItem>;
}

let lastFeedbackWarning: string | null = null;

function feedbackFilePath(): string {
  return path.join(ensureOpenTeamHome(), "resource-feedback.json");
}

function key(type: FeedbackResourceType, id: string): string {
  return `${type}:${id}`;
}

function emptyStore(): ResourceFeedbackStore {
  return {
    version: "1",
    updated_at: new Date().toISOString(),
    items: {}
  };
}

function loadStore(): ResourceFeedbackStore {
  try {
    const file = feedbackFilePath();
    if (!fs.existsSync(file)) return emptyStore();
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<ResourceFeedbackStore>;
    if (!raw || raw.version !== "1" || typeof raw.items !== "object" || !raw.items) {
      return emptyStore();
    }
    return {
      version: "1",
      updated_at: typeof raw.updated_at === "string" ? raw.updated_at : new Date().toISOString(),
      items: raw.items as Record<string, ResourceFeedbackItem>
    };
  } catch (e) {
    lastFeedbackWarning = e instanceof Error ? `feedback read failed: ${e.message}` : `feedback read failed: ${String(e)}`;
    return emptyStore();
  }
}

function saveStore(store: ResourceFeedbackStore): void {
  try {
    const file = feedbackFilePath();
    fs.writeFileSync(file, JSON.stringify(store, null, 2), "utf8");
  } catch (e) {
    lastFeedbackWarning = e instanceof Error ? `feedback write failed: ${e.message}` : `feedback write failed: ${String(e)}`;
    // Non-blocking: feedback persistence should never break primary flow.
  }
}

function ensureItem(
  store: ResourceFeedbackStore,
  type: FeedbackResourceType,
  id: string
): ResourceFeedbackItem {
  const k = key(type, id);
  const existing = store.items[k];
  if (existing) return existing;
  const created: ResourceFeedbackItem = {
    id,
    type,
    attached: 0,
    runs: 0,
    success_runs: 0,
    total_cost_usd: 0,
    total_tokens: 0
  };
  store.items[k] = created;
  return created;
}

export function recordResourceAttachment(resources: Array<{ type: FeedbackResourceType; id: string }>): void {
  if (resources.length === 0) return;
  const store = loadStore();
  for (const resource of resources) {
    const item = ensureItem(store, resource.type, resource.id);
    item.attached += 1;
    item.last_used_at = new Date().toISOString();
  }
  store.updated_at = new Date().toISOString();
  saveStore(store);
}

export function recordRunResourceFeedback(team: TeamConfig, artifact: RunArtifact): void {
  const agentById = new Map(team.execution_plane.agents.map((a) => [a.id, a] as const));
  const usedSkillIds = new Set<string>();
  const usedMcpIds = new Set<string>();
  for (const step of artifact.steps) {
    if (step.status !== "ok") continue;
    const agent = agentById.get(step.agent_id);
    if (!agent) continue;
    for (const skillId of agent.skills) usedSkillIds.add(skillId);
    for (const mcpId of agent.mcps) usedMcpIds.add(mcpId);
  }
  if (usedSkillIds.size === 0 && usedMcpIds.size === 0) return;

  const shareCount = Math.max(1, usedSkillIds.size + usedMcpIds.size);
  const costShare = Number((artifact.totals.estimated_cost_usd / shareCount).toFixed(6));
  const tokenShare = Math.max(1, Math.round(artifact.totals.estimated_tokens / shareCount));

  const store = loadStore();
  for (const skillId of usedSkillIds) {
    const item = ensureItem(store, "skill", skillId);
    item.runs += 1;
    if (artifact.success) item.success_runs += 1;
    item.total_cost_usd = Number((item.total_cost_usd + costShare).toFixed(6));
    item.total_tokens += tokenShare;
    item.last_used_at = artifact.created_at;
  }
  for (const mcpId of usedMcpIds) {
    const item = ensureItem(store, "mcp", mcpId);
    item.runs += 1;
    if (artifact.success) item.success_runs += 1;
    item.total_cost_usd = Number((item.total_cost_usd + costShare).toFixed(6));
    item.total_tokens += tokenShare;
    item.last_used_at = artifact.created_at;
  }
  store.updated_at = new Date().toISOString();
  saveStore(store);
}

export function feedbackScoreDelta(type: FeedbackResourceType, id: string): number {
  const store = loadStore();
  const item = store.items[key(type, id)];
  if (!item || item.runs <= 0) return 0;
  const successRate = item.success_runs / item.runs;
  const avgCost = item.total_cost_usd / item.runs;
  let delta = 0;
  if (successRate >= 0.85) delta += 2;
  else if (successRate >= 0.6) delta += 1;
  else delta -= 1;
  if (avgCost <= 0.01) delta += 1;
  if (item.attached >= 3) delta += 1;
  return Math.max(-2, Math.min(4, delta));
}

export function consumeResourceFeedbackWarning(): string | null {
  const msg = lastFeedbackWarning;
  lastFeedbackWarning = null;
  return msg;
}
