import fs from "node:fs";
import path from "node:path";

function userHomeDir(): string {
  const winHome = process.env.USERPROFILE;
  const unixHome = process.env.HOME;
  return winHome || unixHome || process.cwd();
}

export function getOpenTeamHome(): string {
  const env = process.env.OPENTEAM_HOME;
  if (env && env.trim()) {
    return path.resolve(env);
  }
  return path.resolve(userHomeDir(), ".openteam");
}

export function ensureOpenTeamHome(): string {
  const home = getOpenTeamHome();
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(path.join(home, "teams"), { recursive: true });
  return home;
}

export function teamSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (base.length > 0) {
    return base;
  }
  const hex = Buffer.from(name.trim() || "team", "utf8").toString("hex").slice(0, 12);
  return `team-${hex}`;
}

export function getTeamDirByName(name: string): string {
  return path.join(getOpenTeamHome(), "teams", teamSlug(name));
}
