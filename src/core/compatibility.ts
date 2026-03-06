import { TeamConfig } from "./types";
import { ExportTarget } from "./exporters";

export interface CompatibilityFinding {
  severity: "warn" | "fail";
  code: string;
  message: string;
}

export interface CompatibilityResult {
  target: ExportTarget;
  findings: CompatibilityFinding[];
}

function checkOpenclaw(team: TeamConfig): CompatibilityFinding[] {
  const findings: CompatibilityFinding[] = [];

  if ((team.context_docs ?? []).length > 0) {
    findings.push({
      severity: "warn",
      code: "OPENCLAW_CONTEXT_DOCS_NOT_EMBEDDED",
      message: "context_docs are not embedded in openclaw.team.yaml; keep docs in project separately."
    });
  }

  for (const manager of team.control_plane.manager_agents) {
    findings.push({
      severity: "warn",
      code: "OPENCLAW_MANAGER_AGENT_DROPPED",
      message: `manager agent '${manager.id}' is not explicitly mapped into openclaw swarm config.`
    });
  }

  return findings;
}

function checkClaudeCodeCli(team: TeamConfig): CompatibilityFinding[] {
  const findings: CompatibilityFinding[] = [];

  if (team.control_plane.manager_agents.length > 0) {
    findings.push({
      severity: "warn",
      code: "CLAUDE_MANAGER_AGENT_DROPPED",
      message: "control_plane manager agents are not exported into .claude/agents.json."
    });
  }

  for (const mcp of team.resources.mcps) {
    if ((mcp.permissions ?? []).length > 0) {
      findings.push({
        severity: "warn",
        code: "CLAUDE_MCP_PERMISSION_NOT_ENFORCED",
        message: `mcp '${mcp.id}' permissions are informational only in claude export.`
      });
    }
  }

  for (const skill of team.resources.skills) {
    if ((skill.trust_score ?? 0) <= 0) {
      findings.push({
        severity: "fail",
        code: "CLAUDE_SKILL_TRUST_INVALID",
        message: `skill '${skill.id}' has invalid trust score and should be fixed before export.`
      });
    }
  }

  return findings;
}

function checkOpencode(team: TeamConfig): CompatibilityFinding[] {
  const findings: CompatibilityFinding[] = [];

  if (team.execution_plane.agents.length === 0) {
    findings.push({
      severity: "fail",
      code: "OPENCODE_NO_AGENTS",
      message: "at least one execution agent is required."
    });
  }

  return findings;
}

export function checkTargetCompatibility(team: TeamConfig, target: ExportTarget): CompatibilityResult {
  if (target === "openclaw") {
    return { target, findings: checkOpenclaw(team) };
  }
  if (target === "claude") {
    return { target, findings: checkClaudeCodeCli(team) };
  }
  if (target === "codex") {
    return {
      target,
      findings: team.execution_plane.agents.length === 0
        ? [{ severity: "fail", code: "CODEX_NO_AGENTS", message: "at least one execution agent is required." }]
        : []
    };
  }
  if (target === "aider" || target === "continue" || target === "cline" || target === "openhands" || target === "tabby") {
    return { target, findings: checkOpencode(team) };
  }
  return { target, findings: checkOpencode(team) };
}
