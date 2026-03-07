import fs from "node:fs";
import { ExportTarget, isExportTarget, normalizeExportTarget } from "./targets";
import { exportManifestPath } from "./project-files";

export function readLastExportTarget(projectPath: string): ExportTarget | null {
  const manifest = exportManifestPath(projectPath);
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
