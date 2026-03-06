import { fileExists } from "./config";
import { getCurrentTeamEntry } from "./team-registry";

export function resolveTeamFileOrThrow(options?: { file?: string; team?: string }): string {
  if (options?.file) {
    return options.file;
  }

  if (options?.team) {
    const { findRegistryTeam } = require("./team-registry") as typeof import("./team-registry");
    const entry = findRegistryTeam(options.team);
    if (!entry) {
      throw new Error(`Team not found: ${options.team}`);
    }
    return entry.team_file;
  }

  const current = getCurrentTeamEntry();
  if (current && fileExists(current.team_file)) {
    return current.team_file;
  }

  if (fileExists("team.yaml")) {
    return "team.yaml";
  }

  throw new Error("No team file found. Use `openteam team use --name <team>` or pass --file.");
}
