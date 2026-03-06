import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./config";
import { TeamConfig, TeamVersionSnapshot } from "./types";

function versionId(): string {
  return `ver_${Date.now()}`;
}

function readSnapshot(filePath: string): TeamVersionSnapshot {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as TeamVersionSnapshot;
}

export function saveVersionSnapshot(
  team: TeamConfig,
  versionsDir: string,
  reason: string,
  sourceRunId?: string
): TeamVersionSnapshot {
  ensureDir(versionsDir);
  const snapshot: TeamVersionSnapshot = {
    version_id: versionId(),
    created_at: new Date().toISOString(),
    reason,
    source_run_id: sourceRunId,
    team_config: team
  };
  const outPath = path.resolve(versionsDir, `${snapshot.version_id}.json`);
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), "utf8");
  return snapshot;
}

export function loadVersionSnapshot(versionIdOrPath: string, versionsDir: string): TeamVersionSnapshot {
  const isPath =
    versionIdOrPath.includes(".json") || versionIdOrPath.includes("/") || versionIdOrPath.includes("\\");
  const filePath = isPath
    ? path.resolve(versionIdOrPath)
    : path.resolve(versionsDir, `${versionIdOrPath}.json`);
  return readSnapshot(filePath);
}

export function listVersionSnapshots(versionsDir: string): TeamVersionSnapshot[] {
  const fullDir = path.resolve(versionsDir);
  if (!fs.existsSync(fullDir)) {
    return [];
  }

  return fs
    .readdirSync(fullDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readSnapshot(path.join(fullDir, f)))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}
