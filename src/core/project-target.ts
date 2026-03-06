import fs from "node:fs";
import path from "node:path";
import { ExportTarget, isExportTarget, normalizeExportTarget } from "./targets";

export function readLastExportTarget(projectPath: string): ExportTarget | null {
  const manifest = path.resolve(projectPath, ".openteam-export", "manifest.json");
  if (!fs.existsSync(manifest)) {
    return null;
  }
  try {
    const payload = JSON.parse(fs.readFileSync(manifest, "utf8")) as { target?: string };
    if (payload.target && isExportTarget(payload.target)) {
      return payload.target;
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveProjectTarget(projectPath: string, target?: string, fallback: ExportTarget = "claude"): ExportTarget {
  if (target) {
    return normalizeExportTarget(target);
  }
  const detected = readLastExportTarget(projectPath);
  return detected ?? fallback;
}

