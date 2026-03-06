import path from "node:path";
import fs from "node:fs";
import { Command } from "commander";
import { error, info, kv, status } from "../core/ui";
import { getWorklogPaths, parseSinceToMs, readWorklogEvents, WorklogEvent } from "../core/worklog";
import { readProgressTemplate, renderProgressReport } from "../core/progress-template";
import { ensureDir } from "../core/config";

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

function toBulletList(items: string[], emptyFallback: string): string {
  if (items.length === 0) return `- ${emptyFallback}`;
  return items.map((s) => `- ${s}`).join("\n");
}

function compactStatusSummary(input: { ok: number; warn: number; fail: number; cost_usd: number; latency_ms: number }): string {
  return `ok=${input.ok}, warn=${input.warn}, fail=${input.fail}, cost_usd=${input.cost_usd}, latency_ms=${input.latency_ms}`;
}

function defaultReportPath(project: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return path.resolve(project, ".openteam", "worklog", "reports", `progress-${day}.md`);
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
    .option("--md", "render markdown report from editable template", false)
    .option("--write [path]", "write markdown report to path (default: project .openteam/worklog/reports)", false)
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

      const team = events.map((e) => e.team).find((v) => Boolean(v)) ?? "unknown";
      const typeBreakdown = toBulletList(
        Object.entries(types).map(([k, v]) => `${k}: ${v}`),
        "No event types in this window."
      );
      const completed = toBulletList(
        events
          .filter((e) => e.status === "ok" && (e.agent || e.task || e.note))
          .slice(-8)
          .map((e) => {
            const owner = e.agent ? `[${e.agent}] ` : "";
            const item = e.task ?? e.note ?? e.type;
            return `${owner}${item}`;
          }),
        "No explicit agent-completed items recorded."
      );
      const todo = toBulletList(
        events
          .filter((e) => e.status === "fail" || e.status === "warn")
          .slice(-8)
          .map((e) => e.task ?? e.note ?? `${e.type} needs follow-up`),
        "Define next task and keep current cadence."
      );
      const overallPlan = toBulletList(
        [
          "Keep team objective aligned with current goal and policy constraints.",
          "Execute highest-impact task first, then evaluate quality/cost/latency.",
          "Apply optimization changes only after review and policy pass."
        ],
        "No plan available."
      );
      const progressText =
        events.length === 0
          ? "No activity in selected window."
          : `Observed ${events.length} events in this window. Dominant event type: ${
              Object.entries(types).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "n/a"
            }.`;
      const statusSummary = compactStatusSummary(totals);
      const template = readProgressTemplate(project);
      const markdown = renderProgressReport(template, {
        generated_at: new Date().toISOString(),
        project,
        since: options.since,
        team,
        total_events: events.length,
        status_summary: statusSummary,
        type_breakdown: typeBreakdown,
        overall_plan: overallPlan,
        agent_completed: completed,
        progress: progressText,
        todo
      });

      if (options.md || options.write) {
        info(markdown);
      }
      if (options.write) {
        const outPath =
          typeof options.write === "string" && options.write.trim().length > 0
            ? path.resolve(options.write)
            : defaultReportPath(project);
        ensureDir(path.dirname(outPath));
        fs.writeFileSync(outPath, markdown, "utf8");
        kv("report_file", outPath);
        info("Template path: .openteam/templates/progress-report.md");
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
