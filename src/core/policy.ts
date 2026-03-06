import { TeamConfig } from "./types";

export interface PolicyFinding {
  code: string;
  severity: "fail" | "warn";
  message: string;
}

export interface PolicyResult {
  pass: boolean;
  findings: PolicyFinding[];
}

function isHighRisk(level: string | undefined): boolean {
  return (level ?? "low").toLowerCase() === "high";
}

export function evaluatePolicies(team: TeamConfig): PolicyResult {
  const findings: PolicyFinding[] = [];
  const security = team.policies.security;

  for (const mcp of team.resources.mcps) {
    if (isHighRisk(mcp.risk_level) && !security.allow_high_risk_mcp) {
      findings.push({
        code: "HIGH_RISK_MCP_BLOCKED",
        severity: "fail",
        message: `MCP '${mcp.id}' is high risk but allow_high_risk_mcp=false`
      });
    }
  }

  for (const skill of team.resources.skills) {
    if (isHighRisk(skill.risk_level) && !security.allow_high_risk_skill) {
      findings.push({
        code: "HIGH_RISK_SKILL_BLOCKED",
        severity: "fail",
        message: `Skill '${skill.id}' is high risk but allow_high_risk_skill=false`
      });
    }

    const trust = skill.trust_score ?? 0;
    if (trust < security.min_skill_trust_score) {
      findings.push({
        code: "LOW_SKILL_TRUST",
        severity: "fail",
        message: `Skill '${skill.id}' trust_score=${trust} < min_skill_trust_score=${security.min_skill_trust_score}`
      });
    }

    if (skill.source.startsWith("ai-generated:")) {
      findings.push({
        code: "AI_GENERATED_SKILL",
        severity: "warn",
        message: `Skill '${skill.id}' is AI-generated and should be reviewed`
      });
    }
  }

  for (const agent of team.execution_plane.agents) {
    if (isHighRisk(agent.risk_level) && !security.allow_high_risk_agent) {
      findings.push({
        code: "HIGH_RISK_AGENT_BLOCKED",
        severity: "fail",
        message: `Agent '${agent.id}' is high risk but allow_high_risk_agent=false`
      });
    }
  }

  return {
    pass: findings.every((f) => f.severity !== "fail"),
    findings
  };
}
