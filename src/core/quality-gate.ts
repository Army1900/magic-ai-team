import { TeamConfig } from "./types";
import { applyHighRiskOverride, evaluateTeamQuality, TeamQualityFinding, TeamQualityReport } from "./team-quality";

export interface TeamQualityGateOptions {
  projectPath?: string;
  includeScanners?: boolean;
  ignoreHighRisk?: boolean;
}

export interface TeamQualityGateResult {
  report: TeamQualityReport;
  findings: TeamQualityFinding[];
  fails: TeamQualityFinding[];
  warns: TeamQualityFinding[];
  blocked: boolean;
  onlyHighRiskFails: boolean;
}

export function evaluateTeamQualityGate(team: TeamConfig, options: TeamQualityGateOptions = {}): TeamQualityGateResult {
  const report = evaluateTeamQuality(team, {
    projectPath: options.projectPath,
    includeScanners: options.includeScanners
  });
  const findings = applyHighRiskOverride(report.findings, Boolean(options.ignoreHighRisk));
  const fails = findings.filter((f) => f.severity === "fail");
  const warns = findings.filter((f) => f.severity === "warn");
  const onlyHighRiskFails =
    fails.length > 0 &&
    fails.every((f) => f.code.startsWith("HIGH_RISK_"));

  return {
    report,
    findings,
    fails,
    warns,
    blocked: fails.length > 0,
    onlyHighRiskFails
  };
}
