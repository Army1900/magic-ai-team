import path from "node:path";

export function exportManifestPath(projectPath: string): string {
  return path.resolve(projectPath, ".openteam", "exports", "manifest.json");
}

export function exportManifestDir(projectPath: string): string {
  return path.dirname(exportManifestPath(projectPath));
}
