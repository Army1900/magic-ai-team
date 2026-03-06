import path from "node:path";
import { ensureDir, loadTeamConfig, writeYamlFile } from "./config";
import { ExecutionAgent, McpResource, SkillResource } from "./types";

function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function generateAgentDraft(role: string, model = "openai:gpt-5-mini"): ExecutionAgent {
  const id = slug(role) || "agent";
  return {
    id,
    role,
    risk_level: "medium",
    model: {
      primary: model,
      fallback: ["openai:gpt-5-mini"]
    },
    skills: ["planning"],
    mcps: [],
    input_contract: "task",
    output_contract: `${id}_output`
  };
}

export function generateSkillDraft(
  goal: string,
  options?: { riskLevel?: "low" | "medium" | "high" | string; trustScore?: number }
): SkillResource {
  const id = `${slug(goal)}-skill`;
  const trustScore = options?.trustScore ?? 0.6;
  const riskLevel = options?.riskLevel ?? "high";
  return {
    id,
    source: "ai-generated:local",
    version: "0.1.0",
    license: "UNLICENSED",
    trust_score: trustScore,
    risk_level: riskLevel
  };
}

export function generateMcpDraft(apiRef: string): McpResource {
  const id = `${slug(apiRef)}-mcp`;
  return {
    id,
    source: "ai-generated:local",
    version: "0.1.0",
    auth: "api_key",
    permissions: ["read"],
    risk_level: "medium"
  };
}

export function saveGeneratedResource(kind: "agent" | "skill" | "mcp", id: string, data: unknown): string {
  const dir = path.resolve(".openteam/generated", kind);
  ensureDir(dir);
  const outPath = path.join(dir, `${id}.yaml`);
  writeYamlFile(outPath, data);
  return outPath;
}

export function attachGeneratedToTeam(
  kind: "agent" | "skill" | "mcp",
  generated: ExecutionAgent | SkillResource | McpResource,
  teamPath = "team.yaml"
): void {
  const team = loadTeamConfig(teamPath);

  if (kind === "agent") {
    const agent = generated as ExecutionAgent;
    const existed = team.execution_plane.agents.some((a) => a.id === agent.id);
    if (!existed) {
      team.execution_plane.agents.push(agent);
    }
  }

  if (kind === "skill") {
    const skill = generated as SkillResource;
    const existed = team.resources.skills.some((s) => s.id === skill.id);
    if (!existed) {
      team.resources.skills.push(skill);
    }
  }

  if (kind === "mcp") {
    const mcp = generated as McpResource;
    const existed = team.resources.mcps.some((m) => m.id === mcp.id);
    if (!existed) {
      team.resources.mcps.push(mcp);
    }
  }

  writeYamlFile(teamPath, team);
}
