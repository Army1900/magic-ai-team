import fs from "node:fs";
import path from "node:path";
import { loadTeamConfig } from "./config";
import { runDoctor } from "./doctor";
import { evaluatePolicies } from "./policy";
import { findRegistryTeam, getCurrentTeamEntry, RegistryEntry } from "./team-registry";
import { resolveManagementModel } from "./management-models";

export interface StatusSummary {
  team: RegistryEntry | null;
  team_file: string | null;
  management_models: {
    planner: string;
    optimizer: string;
    exporter_mapper: string;
  };
  doctor: { ok: number; warn: number; fail: number };
  policy: { pass: boolean; warnings: number; failures: number };
  latest_run_file: string | null;
  latest_report_file: string | null;
  latest_export_manifest: string | null;
}

function latestFileInDir(dirPath: string, extension: string): string | null {
  const fullDir = path.resolve(dirPath);
  if (!fs.existsSync(fullDir)) {
    return null;
  }
  const files = fs
    .readdirSync(fullDir)
    .filter((f) => f.endsWith(extension))
    .map((f) => ({
      path: path.join(fullDir, f),
      mtime: fs.statSync(path.join(fullDir, f)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0]?.path ?? null;
}

function latestManifestInOut(baseOutDir = ".openteam"): string | null {
  const base = path.resolve(baseOutDir);
  if (!fs.existsSync(base)) {
    return null;
  }

  const manifests: Array<{ path: string; mtime: number }> = [];
  const stack = [base];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile() && entry.name === "manifest.json" && full.includes(".openteam-export")) {
        manifests.push({ path: full, mtime: fs.statSync(full).mtimeMs });
      }
    }
  }
  manifests.sort((a, b) => b.mtime - a.mtime);
  return manifests[0]?.path ?? null;
}

function resolveTeamEntry(teamNameOrSlug?: string): RegistryEntry | null {
  try {
    if (teamNameOrSlug) {
      return findRegistryTeam(teamNameOrSlug);
    }
    return getCurrentTeamEntry();
  } catch {
    return null;
  }
}

export function getStatusSummary(options?: { team?: string; file?: string }): StatusSummary {
  const entry = options?.file ? null : resolveTeamEntry(options?.team);
  const teamFile = options?.file ?? entry?.team_file ?? null;

  if (!teamFile || !fs.existsSync(path.resolve(teamFile))) {
    return {
      team: entry,
      team_file: teamFile,
      management_models: {
        planner: resolveManagementModel("planner"),
        optimizer: resolveManagementModel("optimizer"),
        exporter_mapper: resolveManagementModel("exporter_mapper")
      },
      doctor: { ok: 0, warn: 0, fail: 1 },
      policy: { pass: false, warnings: 0, failures: 1 },
      latest_run_file: null,
      latest_report_file: null,
      latest_export_manifest: latestManifestInOut(".openteam")
    };
  }

  const team = loadTeamConfig(teamFile);
  const doctorChecks = runDoctor(teamFile, "openteam.yaml");
  const doctor = {
    ok: doctorChecks.filter((c) => c.status === "ok").length,
    warn: doctorChecks.filter((c) => c.status === "warn").length,
    fail: doctorChecks.filter((c) => c.status === "fail").length
  };

  const policyResult = evaluatePolicies(team);
  const policy = {
    pass: policyResult.pass,
    warnings: policyResult.findings.filter((f) => f.severity === "warn").length,
    failures: policyResult.findings.filter((f) => f.severity === "fail").length
  };

  return {
    team: entry,
    team_file: teamFile,
    management_models: {
      planner: resolveManagementModel("planner"),
      optimizer: resolveManagementModel("optimizer"),
      exporter_mapper: resolveManagementModel("exporter_mapper")
    },
    doctor,
    policy,
    latest_run_file: latestFileInDir(team.observability.store.runs_dir, ".json"),
    latest_report_file: latestFileInDir(team.observability.store.reports_dir, ".json"),
    latest_export_manifest: latestManifestInOut(".openteam")
  };
}
