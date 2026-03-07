import fs from "node:fs";
import path from "node:path";
import { ensureOpenTeamHome } from "./home";

export interface GoHistoryRecord {
  ts: string;
  status: "ok" | "fail";
  target?: string;
  project?: string;
  team_slug?: string;
  team_file?: string;
  recovery?: string;
  error?: string;
  summary?: {
    ready_to_start?: boolean;
    quality_overall?: number;
    top_issue_codes?: string[];
  };
}

function historyFile(): string {
  const dir = path.join(ensureOpenTeamHome(), "history");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "go-history.jsonl");
}

export function appendGoHistory(record: Omit<GoHistoryRecord, "ts"> & { ts?: string }): void {
  const file = historyFile();
  const row: GoHistoryRecord = {
    ...record,
    ts: record.ts ?? new Date().toISOString()
  };
  fs.appendFileSync(file, `${JSON.stringify(row)}\n`, "utf8");
}

export function readGoHistory(limit = 30): GoHistoryRecord[] {
  const file = historyFile();
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const out: GoHistoryRecord[] = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line) as GoHistoryRecord);
    } catch {
      // skip malformed lines
    }
  }
  return out.slice(-Math.max(1, limit)).reverse();
}

