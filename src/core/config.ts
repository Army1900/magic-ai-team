import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { OpenTeamConfig, TeamConfig } from "./types";

export function readYamlFile<T>(filePath: string): T {
  const fullPath = path.resolve(filePath);
  const raw = fs.readFileSync(fullPath, "utf8");
  return YAML.parse(raw) as T;
}

export function writeYamlFile(filePath: string, data: unknown): void {
  const fullPath = path.resolve(filePath);
  const yamlText = YAML.stringify(data, { lineWidth: 0 });
  fs.writeFileSync(fullPath, yamlText, "utf8");
}

export function fileExists(filePath: string): boolean {
  return fs.existsSync(path.resolve(filePath));
}

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(path.resolve(dirPath), { recursive: true });
}

export function loadTeamConfig(filePath = "team.yaml"): TeamConfig {
  return readYamlFile<TeamConfig>(filePath);
}

export function loadOpenTeamConfig(filePath = "openteam.yaml"): OpenTeamConfig {
  return readYamlFile<OpenTeamConfig>(filePath);
}
