export interface GateFinding {
  severity: "warn" | "fail";
}

export interface GateAssessment<T extends GateFinding> {
  fails: T[];
  warns: T[];
  blocked: boolean;
}

export function assessGateFindings<T extends GateFinding>(findings: T[], strict: boolean): GateAssessment<T> {
  const fails = findings.filter((f) => f.severity === "fail");
  const warns = findings.filter((f) => f.severity === "warn");
  return {
    fails,
    warns,
    blocked: fails.length > 0 || (strict && warns.length > 0)
  };
}

