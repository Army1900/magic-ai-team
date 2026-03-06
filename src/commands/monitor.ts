import path from "node:path";
import { Command } from "commander";
import { error, info, kv, status } from "../core/ui";
import { getWorklogPaths, parseSinceToMs, readWorklogEvents, WorklogEvent } from "../core/worklog";

function resolveProject(input?: string): string {
  return path.resolve(input ?? process.cwd());
}

function formatEventLine(e: WorklogEvent): string {
  return `${e.ts} | ${e.type}` +
    (e.status ? ` | ${e.status}` : "") +
    (e.team ? ` | team=${e.team}` : "") +
    (e.agent ? ` | agent=${e.agent}` : "") +
    (e.task ? ` | task=${e.task}` : "") +
    (e.note ? ` | ${e.note}` : "");
}

export function registerMonitorCommand(program: Command): void {
  const cmd = program.command("monitor").description("Monitor project worklog under .openteam/worklog");

  cmd
    .command("status")
    .description("Show worklog status summary")
    .option("--project <path>", "project root path", ".")
    .option("--json", "json output mode", false)
    .action((options) => {
      const project = resolveProject(options.project);
      const paths = getWorklogPaths(project);
      const events = readWorklogEvents(project);
      const last = events[events.length - 1] ?? null;
      const ok = events.filter((e) => e.status === "ok").length;
      const fail = events.filter((e) => e.status === "fail").length;
      const warn = events.filter((e) => e.status === "warn").length;
      const byType: Record<string, number> = {};
      for (const e of events) {
        byType[e.type] = (byType[e.type] ?? 0) + 1;
      }

      const payload = {
        project,
        worklog_root: paths.root,
        total_events: events.length,
        last_event: last,
        status_counts: { ok, warn, fail },
        type_counts: byType
      };
      if (options.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      kv("project", project);
      kv("worklog_root", paths.root);
      kv("total_events", events.length);
      if (last) {
        kv("last_event", `${last.ts} ${last.type}`);
      } else {
        status("warn", "worklog", "no events found");
      }
      kv("ok", ok);
      kv("warn", warn);
      kv("fail", fail);
      for (const [k, v] of Object.entries(byType)) {
        info(`- ${k}: ${v}`);
      }
    });

  cmd
    .command("tail")
    .description("Show latest N worklog events")
    .option("--project <path>", "project root path", ".")
    .option("-n, --lines <count>", "number of events", "20")
    .option("--json", "json output mode", false)
    .action((options) => {
      const project = resolveProject(options.project);
      const events = readWorklogEvents(project);
      const n = Math.max(1, Number(options.lines) || 20);
      const latest = events.slice(-n);
      if (options.json) {
        console.log(JSON.stringify({ project, count: latest.length, events: latest }, null, 2));
        return;
      }
      if (latest.length === 0) {
        status("warn", "worklog", "no events found");
        info("Next: run `openteam export --target <target> --out <project-path>` to initialize worklog.");
        return;
      }
      for (const e of latest) {
        info(formatEventLine(e));
      }
    });

  cmd
    .command("report")
    .description("Summarize worklog events in a time window")
    .option("--project <path>", "project root path", ".")
    .option("--since <window>", "time window like 24h|7d|30m", "24h")
    .option("--json", "json output mode", false)
    .action((options) => {
      const project = resolveProject(options.project);
      const span = parseSinceToMs(String(options.since));
      if (!span) {
        error("Invalid --since value. Use formats like 30m, 24h, 7d.");
        process.exitCode = 1;
        return;
      }

      const all = readWorklogEvents(project);
      const threshold = Date.now() - span;
      const events = all.filter((e) => Date.parse(e.ts) >= threshold);
      const totals = {
        ok: events.filter((e) => e.status === "ok").length,
        warn: events.filter((e) => e.status === "warn").length,
        fail: events.filter((e) => e.status === "fail").length,
        cost_usd: Number(events.reduce((s, e) => s + (e.cost_usd ?? 0), 0).toFixed(4)),
        latency_ms: events.reduce((s, e) => s + (e.latency_ms ?? 0), 0)
      };
      const types: Record<string, number> = {};
      for (const e of events) {
        types[e.type] = (types[e.type] ?? 0) + 1;
      }

      const payload = {
        project,
        since: options.since,
        total_events: events.length,
        totals,
        type_counts: types
      };

      if (options.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      kv("project", project);
      kv("since", options.since);
      kv("total_events", events.length);
      kv("ok", totals.ok);
      kv("warn", totals.warn);
      kv("fail", totals.fail);
      kv("cost_usd", totals.cost_usd);
      kv("latency_ms", totals.latency_ms);
      for (const [k, v] of Object.entries(types)) {
        info(`- ${k}: ${v}`);
      }
    });
}

