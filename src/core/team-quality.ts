import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { TeamConfig } from "./types";

export interface TeamQualityFinding {
  severity: "warn" | "fail";
  code: string;
  message: string;
  source: "policy" | "semantic" | "scanner";
}

export interface TeamQualityReport {
  scores: {
    efficiency: number;
    performance: number;
    security: number;
    overall: number;
  };
  findings: TeamQualityFinding[];
  scanner_summary: Array<{
    tool: string;
    available: boolean;
    status: "ok" | "warn" | "fail" | "skipped";
    detail: string;
  }>;
}

export interface TeamQualityOptions {
  projectPath?: string;
  includeScanners?: boolean;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

const commandAvailabilityCache = new Map<string, boolean>();

function commandExists(command: string): boolean {
  const cached = commandAvailabilityCache.get(command);
  if (typeof cached === "boolean") return cached;
  const check = process.platform === "win32"
    ? spawnSync("where", [command], { stdio: "ignore", shell: true })
    : spawnSync("command", ["-v", command], { stdio: "ignore", shell: true });
  const available = check.status === 0;
  commandAvailabilityCache.set(command, available);
  return available;
}

function costPer1k(model: string): number {
  const m = model.toLowerCase();
  if (m.includes("gpt-5-mini")) return 0.002;
  if (m.includes("gpt-5")) return 0.01;
  if (m.includes("claude-sonnet")) return 0.008;
  return 0.006;
}

function semanticFindings(team: TeamConfig): TeamQualityFinding[] {
  const findings: TeamQualityFinding[] = [];
  const dangerousSkillTokens = ["forensic", "redline", "threat", "incident", "regulatory"];
  for (const skill of team.resources.skills) {
    const id = skill.id.toLowerCase();
    if (dangerousSkillTokens.some((t) => id.includes(t)) && (skill.risk_level ?? "low") !== "high") {
      findings.push({
        severity: "warn",
        code: "SKILL_SEMANTIC_RISK_MISMATCH",
        message: `skill '${skill.id}' has elevated semantic risk but non-high risk_level`,
        source: "semantic"
      });
    }
  }

  for (const mcp of team.resources.mcps) {
    const perms = (mcp.permissions ?? []).map((p) => p.toLowerCase());
    const hasDangerousPerm = perms.some((p) => p.includes("write") || p.includes("delete") || p.includes("admin"));
    if (hasDangerousPerm && (mcp.risk_level ?? "low") === "low") {
      findings.push({
        severity: "warn",
        code: "MCP_PERMISSION_RISK_MISMATCH",
        message: `mcp '${mcp.id}' has write/admin-like permission but low risk_level`,
        source: "semantic"
      });
    }
  }
  return findings;
}

function policyFindings(team: TeamConfig): TeamQualityFinding[] {
  const findings: TeamQualityFinding[] = [];
  const highRiskAgents = team.execution_plane.agents.filter((a) => (a.risk_level ?? "low") === "high");
  const highRiskSkills = team.resources.skills.filter((s) => (s.risk_level ?? "low") === "high");
  const highRiskMcps = team.resources.mcps.filter((m) => (m.risk_level ?? "low") === "high");

  if (highRiskAgents.length > 0) {
    findings.push({
      severity: "fail",
      code: "HIGH_RISK_AGENT_PRESENT",
      message: `high-risk agents present: ${highRiskAgents.map((a) => a.id).join(", ")}`,
      source: "policy"
    });
  }
  if (highRiskSkills.length > 0) {
    findings.push({
      severity: "fail",
      code: "HIGH_RISK_SKILL_PRESENT",
      message: `high-risk skills present: ${highRiskSkills.map((s) => s.id).join(", ")}`,
      source: "policy"
    });
  }
  if (highRiskMcps.length > 0) {
    findings.push({
      severity: "fail",
      code: "HIGH_RISK_MCP_PRESENT",
      message: `high-risk mcps present: ${highRiskMcps.map((m) => m.id).join(", ")}`,
      source: "policy"
    });
  }
  return findings;
}

function scannerSummary(projectPath?: string): TeamQualityReport["scanner_summary"] {
  const scanners = ["gitleaks", "semgrep", "trivy"];
  if (!projectPath) {
    return scanners.map((tool) => ({
      tool,
      available: commandExists(tool),
      status: "skipped" as const,
      detail: "project path not provided"
    }));
  }
  return scanners.map((tool) => {
    const available = commandExists(tool);
    if (!available) {
      return { tool, available: false, status: "warn" as const, detail: "not installed" };
    }
    return { tool, available: true, status: "ok" as const, detail: "available for deep scan" };
  });
}

function runScanner(
  tool: "gitleaks" | "semgrep" | "trivy",
  projectPath: string
): { status: "ok" | "warn" | "fail"; detail: string } {
  const cwd = path.resolve(projectPath);
  if (!fs.existsSync(cwd)) {
    return { status: "warn", detail: "project path not found" };
  }
  const args =
    tool === "gitleaks"
      ? ["detect", "--source", cwd, "--no-banner", "--redact", "--exit-code", "1"]
      : tool === "semgrep"
      ? ["scan", "--config", "auto", "--error", cwd]
      : ["fs", "--quiet", "--severity", "HIGH,CRITICAL", "--exit-code", "1", cwd];

  const result = spawnSync(tool, args, {
    shell: true,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024
  });
  if (typeof result.status !== "number") {
    return { status: "warn", detail: `scan timeout or interrupted (${tool})` };
  }
  if (result.status === 0) {
    return { status: "ok", detail: "no blocking findings" };
  }
  if (result.status === 1) {
    return { status: "fail", detail: "blocking findings detected" };
  }
  const err = String(result.stderr || result.stdout || "scanner execution error").trim().slice(0, 220);
  return { status: "warn", detail: err || "scanner execution error" };
}

export function evaluateTeamQuality(team: TeamConfig, options: TeamQualityOptions = {}): TeamQualityReport {
  const findings: TeamQualityFinding[] = [];
  findings.push(...policyFindings(team));
  findings.push(...semanticFindings(team));
  const scannerDetails = options.includeScanners ? scannerSummary(options.projectPath) : [];
  const scannerOut = scannerDetails.map((row) => ({ ...row }));
  const projectPath = options.projectPath ? path.resolve(options.projectPath) : undefined;
  const hasProjectPath = Boolean(projectPath && fs.existsSync(projectPath));
  if (options.includeScanners && projectPath && hasProjectPath) {
    for (const row of scannerOut) {
      if (!row.available) continue;
      const tool = row.tool as "gitleaks" | "semgrep" | "trivy";
      const result = runScanner(tool, projectPath);
      row.status = result.status;
      row.detail = result.detail;
      if (result.status === "fail") {
        findings.push({
          severity: "fail",
          code: `SCANNER_${tool.toUpperCase()}_DETECTED`,
          message: `${tool}: ${result.detail}`,
          source: "scanner"
        });
      } else if (result.status === "warn") {
        findings.push({
          severity: "warn",
          code: `SCANNER_${tool.toUpperCase()}_WARN`,
          message: `${tool}: ${result.detail}`,
          source: "scanner"
        });
      }
    }
  } else if (options.includeScanners && options.projectPath && !hasProjectPath) {
    for (const row of scannerOut) {
      if (row.status === "ok" || row.status === "skipped") {
        row.status = "warn";
        row.detail = "project path not found";
      }
    }
  }

  const modelCosts = team.execution_plane.agents.map((a) => costPer1k(a.model.primary));
  const avgCost = modelCosts.length > 0 ? modelCosts.reduce((s, n) => s + n, 0) / modelCosts.length : 0.006;
  const efficiency = clampScore(100 - avgCost * 6000 - Math.max(0, team.execution_plane.agents.length - 6) * 6);

  const missingContracts = team.execution_plane.agents.filter(
    (a) => !a.input_contract?.trim() || !a.output_contract?.trim()
  ).length;
  const performance = clampScore(92 - missingContracts * 15 - Math.max(0, team.execution_plane.agents.length - 8) * 5);

  const failCount = findings.filter((f) => f.severity === "fail").length;
  const warnCount = findings.filter((f) => f.severity === "warn").length;
  const security = clampScore(96 - failCount * 18 - warnCount * 6);
  const overall = clampScore(efficiency * 0.3 + performance * 0.3 + security * 0.4);

  return {
    scores: { efficiency, performance, security, overall },
    findings,
    scanner_summary: scannerOut
  };
}

export function applyHighRiskOverride(
  findings: TeamQualityFinding[],
  ignoreHighRisk: boolean
): TeamQualityFinding[] {
  if (!ignoreHighRisk) return findings;
  return findings.map((f) =>
    f.code.startsWith("HIGH_RISK_")
      ? { ...f, severity: "warn", code: `${f.code}_IGNORED`, message: `${f.message} (ignored by user)` }
      : f
  );
}
