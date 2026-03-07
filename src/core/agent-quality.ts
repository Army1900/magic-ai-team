import { RunArtifact, TeamConfig } from "./types";

export interface AgentQualityFinding {
  severity: "warn" | "fail";
  code: string;
  agent_id: string;
  message: string;
}

export interface AgentQualityReport {
  ok: boolean;
  findings: AgentQualityFinding[];
  summary: {
    total_agents: number;
    failed_agents: number;
    warned_agents: number;
  };
}

function hasStructuredContract(contract: string): boolean {
  const c = contract.toLowerCase();
  return c.includes("json") || c.includes("schema") || c.includes("structured");
}

function maybeStructuredText(text: string): boolean {
  const t = text.trim();
  return t.startsWith("{") || t.startsWith("[");
}

export function evaluateAgentQuality(team: TeamConfig, artifact: RunArtifact): AgentQualityReport {
  const findings: AgentQualityFinding[] = [];
  const stepByAgent = new Map(artifact.steps.map((s) => [s.agent_id, s] as const));
  const highRiskSkillIds = new Set(
    team.resources.skills.filter((s) => (s.risk_level ?? "low") === "high").map((s) => s.id)
  );
  const highRiskMcpIds = new Set(
    team.resources.mcps.filter((m) => (m.risk_level ?? "low") === "high").map((m) => m.id)
  );

  for (const agent of team.execution_plane.agents) {
    const step = stepByAgent.get(agent.id);
    if (!agent.input_contract || agent.input_contract.trim().length < 3) {
      findings.push({
        severity: "fail",
        code: "INPUT_CONTRACT_INVALID",
        agent_id: agent.id,
        message: "input_contract is missing or too short"
      });
    }
    if (!agent.output_contract || agent.output_contract.trim().length < 3) {
      findings.push({
        severity: "fail",
        code: "OUTPUT_CONTRACT_INVALID",
        agent_id: agent.id,
        message: "output_contract is missing or too short"
      });
    }
    if (!step) {
      findings.push({
        severity: "warn",
        code: "STEP_MISSING",
        agent_id: agent.id,
        message: "no run step found for this agent"
      });
      continue;
    }
    if (step.status !== "ok") {
      findings.push({
        severity: "fail",
        code: "STEP_FAILED",
        agent_id: agent.id,
        message: "agent execution step failed"
      });
    }
    if (hasStructuredContract(agent.output_contract) && !maybeStructuredText(step.output_preview)) {
      findings.push({
        severity: "warn",
        code: "OUTPUT_FORMAT_MISMATCH",
        agent_id: agent.id,
        message: "structured output contract expected but output preview is not structured"
      });
    }
    if ((agent.risk_level ?? "low") === "high" && !team.policies.security.allow_high_risk_agent) {
      findings.push({
        severity: "fail",
        code: "HIGH_RISK_AGENT_BLOCKED",
        agent_id: agent.id,
        message: "high risk agent is not allowed by policy"
      });
    }
    if (!team.policies.security.allow_high_risk_skill && agent.skills.some((id) => highRiskSkillIds.has(id))) {
      findings.push({
        severity: "fail",
        code: "HIGH_RISK_SKILL_BLOCKED",
        agent_id: agent.id,
        message: "agent is bound to high-risk skill(s) but policy disallows them"
      });
    }
    if (!team.policies.security.allow_high_risk_mcp && agent.mcps.some((id) => highRiskMcpIds.has(id))) {
      findings.push({
        severity: "fail",
        code: "HIGH_RISK_MCP_BLOCKED",
        agent_id: agent.id,
        message: "agent is bound to high-risk mcp(s) but policy disallows them"
      });
    }
  }

  const failedAgentIds = new Set(findings.filter((f) => f.severity === "fail").map((f) => f.agent_id));
  const warnedAgentIds = new Set(findings.filter((f) => f.severity === "warn").map((f) => f.agent_id));
  return {
    ok: failedAgentIds.size === 0,
    findings,
    summary: {
      total_agents: team.execution_plane.agents.length,
      failed_agents: failedAgentIds.size,
      warned_agents: warnedAgentIds.size
    }
  };
}

