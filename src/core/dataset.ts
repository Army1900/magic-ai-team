import fs from "node:fs";
import path from "node:path";

export function loadTasksFromDataset(datasetPath: string): string[] {
  const fullPath = path.resolve(datasetPath);
  const raw = fs.readFileSync(fullPath, "utf8").trim();
  if (!raw) {
    return [];
  }

  if (fullPath.endsWith(".json")) {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((v) => String(v)).filter(Boolean);
    }
    if (typeof parsed === "object" && parsed !== null && "tasks" in parsed) {
      const tasks = (parsed as { tasks?: unknown }).tasks;
      if (Array.isArray(tasks)) {
        return tasks.map((v) => String(v)).filter(Boolean);
      }
    }
    return [];
  }

  if (fullPath.endsWith(".jsonl")) {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          const obj = JSON.parse(line) as { task?: unknown };
          return obj.task ? String(obj.task) : "";
        } catch {
          return "";
        }
      })
      .filter(Boolean);
  }

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
