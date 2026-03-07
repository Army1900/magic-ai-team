import { WorklogEvent } from "./worklog";

export interface UsageByAgentRow {
  agent: string;
  tokens: number;
  cost_usd: number;
}

export interface UsageByRunRow {
  run_id: string;
  tokens: number;
  cost_usd: number;
  latency_ms: number;
}

export interface BillingSummary {
  tokens: number;
  cost_usd: number;
  latency_ms: number;
  run_count: number;
  avg_run_cost_usd: number;
  max_run_cost_usd: number;
  byAgent: UsageByAgentRow[];
  byRun: UsageByRunRow[];
}

function readRunId(event: WorklogEvent): string {
  const value = event.meta ? event.meta["run_id"] : undefined;
  return typeof value === "string" ? value : "";
}

function round4(v: number): number {
  return Number(v.toFixed(4));
}

export function summarizeBilling(events: WorklogEvent[]): BillingSummary {
  // Prefer fine-grained run_step accounting; fall back to run-level totals only when steps are unavailable.
  const runStepTotals = new Map<string, { tokens: number; cost_usd: number; latency_ms: number }>();
  const runEventTotals = new Map<string, { tokens: number; cost_usd: number; latency_ms: number }>();
  const byAgent = new Map<string, { tokens: number; cost_usd: number }>();
  const misc = { tokens: 0, cost_usd: 0, latency_ms: 0 };

  for (const e of events) {
    const rid = readRunId(e);
    if (e.type === "run_step" && rid) {
      const row = runStepTotals.get(rid) ?? { tokens: 0, cost_usd: 0, latency_ms: 0 };
      row.tokens += e.tokens ?? 0;
      row.cost_usd += e.cost_usd ?? 0;
      row.latency_ms += e.latency_ms ?? 0;
      runStepTotals.set(rid, row);

      const agent = e.agent ?? "team";
      const usage = byAgent.get(agent) ?? { tokens: 0, cost_usd: 0 };
      usage.tokens += e.tokens ?? 0;
      usage.cost_usd += e.cost_usd ?? 0;
      byAgent.set(agent, usage);
      continue;
    }

    if (e.type === "run" && rid) {
      runEventTotals.set(rid, {
        tokens: e.tokens ?? 0,
        cost_usd: e.cost_usd ?? 0,
        latency_ms: e.latency_ms ?? 0
      });
      continue;
    }

    const tokens = e.tokens ?? 0;
    const cost = e.cost_usd ?? 0;
    const latency = e.latency_ms ?? 0;
    if (tokens <= 0 && cost <= 0 && latency <= 0) {
      continue;
    }
    misc.tokens += tokens;
    misc.cost_usd += cost;
    misc.latency_ms += latency;
    const agent = e.agent ?? "team";
    const usage = byAgent.get(agent) ?? { tokens: 0, cost_usd: 0 };
    usage.tokens += tokens;
    usage.cost_usd += cost;
    byAgent.set(agent, usage);
  }

  const mergedRunIds = new Set<string>([...runEventTotals.keys(), ...runStepTotals.keys()]);
  const byRun: UsageByRunRow[] = [];
  let totalTokens = misc.tokens;
  let totalCost = misc.cost_usd;
  let totalLatency = misc.latency_ms;
  let maxRunCost = 0;

  for (const rid of mergedRunIds) {
    const selected = runStepTotals.get(rid) ?? runEventTotals.get(rid) ?? { tokens: 0, cost_usd: 0, latency_ms: 0 };
    totalTokens += selected.tokens;
    totalCost += selected.cost_usd;
    totalLatency += selected.latency_ms;
    if (selected.cost_usd > maxRunCost) {
      maxRunCost = selected.cost_usd;
    }
    byRun.push({
      run_id: rid,
      tokens: selected.tokens,
      cost_usd: round4(selected.cost_usd),
      latency_ms: selected.latency_ms
    });
  }

  const byAgentRows = Array.from(byAgent.entries())
    .map(([agent, row]) => ({
      agent,
      tokens: row.tokens,
      cost_usd: round4(row.cost_usd)
    }))
    .sort((a, b) => b.cost_usd - a.cost_usd);

  byRun.sort((a, b) => b.cost_usd - a.cost_usd);
  // avg/max run cost are used by monitor budget alerts to reflect per-run policy semantics.
  const runCount = byRun.length;
  return {
    tokens: totalTokens,
    cost_usd: round4(totalCost),
    latency_ms: totalLatency,
    run_count: runCount,
    avg_run_cost_usd: runCount > 0 ? round4(totalCost / runCount) : 0,
    max_run_cost_usd: round4(maxRunCost),
    byAgent: byAgentRows,
    byRun
  };
}
