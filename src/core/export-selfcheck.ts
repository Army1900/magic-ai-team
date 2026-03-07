import fs from "node:fs";
import { ExportResult, validateExportResult } from "./exporters";
import { ExportTarget } from "./targets";
import { getLauncherHealth } from "./launchers";

export interface ExportSelfCheckFinding {
  severity: "ok" | "warn" | "fail";
  code: string;
  message: string;
}

export interface ExportSelfCheckReport {
  ok: boolean;
  findings: ExportSelfCheckFinding[];
}

function parseJsonFile(file: string): string | null {
  try {
    const raw = fs.readFileSync(file, "utf8");
    JSON.parse(raw);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export function runExportSelfCheck(result: ExportResult, target: ExportTarget): ExportSelfCheckReport {
  const findings: ExportSelfCheckFinding[] = [];

  const validation = validateExportResult(result);
  for (const finding of validation.findings) {
    findings.push({
      severity: finding.severity,
      code: `TARGET_${finding.code}`,
      message: finding.message
    });
  }

  for (const file of result.files) {
    if (!fs.existsSync(file)) {
      findings.push({ severity: "fail", code: "FILE_MISSING", message: `missing file: ${file}` });
      continue;
    }
    const stat = fs.statSync(file);
    if (!stat.isFile()) {
      findings.push({ severity: "fail", code: "FILE_INVALID", message: `not a file: ${file}` });
      continue;
    }
    if (stat.size === 0) {
      findings.push({ severity: "warn", code: "FILE_EMPTY", message: `empty file: ${file}` });
    }
    if (file.toLowerCase().endsWith(".json")) {
      const parseErr = parseJsonFile(file);
      if (parseErr) {
        findings.push({ severity: "fail", code: "JSON_PARSE_FAIL", message: `${file}: ${parseErr}` });
      }
    }
  }

  const launcher = getLauncherHealth(target);
  findings.push(
    launcher.available
      ? { severity: "ok", code: "LAUNCHER_READY", message: `launcher available: ${launcher.command}` }
      : { severity: "warn", code: "LAUNCHER_MISSING", message: `launcher command not found: ${launcher.command}` }
  );

  const hasFail = findings.some((f) => f.severity === "fail");
  return {
    ok: !hasFail,
    findings
  };
}

