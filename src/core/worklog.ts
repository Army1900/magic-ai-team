import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./config";

export interface WorklogEvent {
  ts: string;
  type: string;
  team?: string;
  agent?: string;
  task?: string;
  status?: string;
  latency_ms?: number;
  cost_usd?: number;
  tokens?: number;
  artifact_path?: string;
  note?: string;
  meta?: Record<string, unknown>;
}

export interface WorklogPaths {
  root: string;
  events: string;
  dailyDir: string;
  summary: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function dayKey(ts: string): string {
  return ts.slice(0, 10);
}

export function getWorklogPaths(projectPath: string): WorklogPaths {
  const root = path.resolve(projectPath, ".openteam", "worklog");
  return {
    root,
    events: path.join(root, "events.jsonl"),
    dailyDir: path.join(root, "daily"),
    summary: path.join(root, "summary.json")
  };
}

function safeReadJson(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

export function ensureProjectWorklog(projectPath: string, seed?: { team?: string; note?: string }): WorklogPaths {
  const p = getWorklogPaths(projectPath);
  ensureDir(p.root);
  ensureDir(p.dailyDir);
  if (!fs.existsSync(p.events)) {
    fs.writeFileSync(p.events, "", "utf8");
  }
  if (!fs.existsSync(p.summary)) {
    fs.writeFileSync(
      p.summary,
      JSON.stringify(
        {
          created_at: nowIso(),
          last_event_at: null,
          total_events: 0,
          team: seed?.team ?? null,
          note: seed?.note ?? "project worklog initialized"
        },
        null,
        2
      ),
      "utf8"
    );
  }
  return p;
}

function updateSummary(paths: WorklogPaths, lastEvent: WorklogEvent): void {
  const current = (safeReadJson(paths.summary) as Record<string, unknown> | null) ?? {};
  const next = {
    ...current,
    last_event_at: lastEvent.ts,
    total_events: Number(current.total_events ?? 0) + 1,
    team: lastEvent.team ?? current.team ?? null
  };
  fs.writeFileSync(paths.summary, JSON.stringify(next, null, 2), "utf8");
}

function appendDaily(paths: WorklogPaths, event: WorklogEvent): void {
  const dayFile = path.join(paths.dailyDir, `${dayKey(event.ts)}.md`);
  if (!fs.existsSync(dayFile)) {
    fs.writeFileSync(dayFile, `# Worklog ${dayKey(event.ts)}\n\n`, "utf8");
  }
  const line =
    `- ${event.ts} | ${event.type}` +
    (event.status ? ` | status=${event.status}` : "") +
    (event.team ? ` | team=${event.team}` : "") +
    (event.task ? ` | task=${event.task}` : "") +
    (event.note ? ` | note=${event.note}` : "") +
    `\n`;
  fs.appendFileSync(dayFile, line, "utf8");
}

export function appendWorklogEvent(projectPath: string, event: Omit<WorklogEvent, "ts"> & { ts?: string }): WorklogEvent {
  const paths = ensureProjectWorklog(projectPath, { team: event.team });
  const normalized: WorklogEvent = {
    ...event,
    ts: event.ts ?? nowIso()
  };
  fs.appendFileSync(paths.events, `${JSON.stringify(normalized)}\n`, "utf8");
  appendDaily(paths, normalized);
  updateSummary(paths, normalized);
  return normalized;
}

export function readWorklogEvents(projectPath: string): WorklogEvent[] {
  const paths = getWorklogPaths(projectPath);
  if (!fs.existsSync(paths.events)) {
    return [];
  }
  const lines = fs
    .readFileSync(paths.events, "utf8")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const events: WorklogEvent[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as WorklogEvent);
    } catch {
      // skip broken line
    }
  }
  return events;
}

export function parseSinceToMs(input: string): number | null {
  const v = input.trim().toLowerCase();
  const m = v.match(/^(\d+)\s*([smhdw])$/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2];
  const mult =
    unit === "s" ? 1000 :
    unit === "m" ? 60 * 1000 :
    unit === "h" ? 60 * 60 * 1000 :
    unit === "d" ? 24 * 60 * 60 * 1000 :
    7 * 24 * 60 * 60 * 1000;
  return n * mult;
}

