import { RunArtifact, TeamConfig, OptimizationResult, OptimizationChange } from "./types";

function setIfChanged(
  changes: OptimizationChange[],
  type: OptimizationChange["type"],
  path: string,
  before: string,
  after: string
): void {
  if (before !== after) {
    changes.push({ type, path, before, after });
  }
}

export function optimizeTeamFromRun(team: TeamConfig, run: RunArtifact): OptimizationResult {
  const next: TeamConfig = JSON.parse(JSON.stringify(team));
  const changes: OptimizationChange[] = [];
  const reason = run.failure_reason ?? "general_optimization";

  const firstExec = next.execution_plane.agents[0];
  const lastExec = next.execution_plane.agents[next.execution_plane.agents.length - 1];

  if (!firstExec || !lastExec) {
    return { applied: false, reason: "no_execution_agents", changes: [] };
  }

  if (run.failure_reason?.toLowerCase().includes("budget exceeded")) {
    const before = lastExec.model.primary;
    const fallback = lastExec.model.fallback?.[0] ?? "openai:gpt-5-mini";
    lastExec.model.primary = fallback;
    setIfChanged(changes, "model_change", `execution_plane.agents[${next.execution_plane.agents.length - 1}].model.primary`, before, fallback);

    const beforeBudget = String(next.policies.budget.max_cost_usd_per_run);
    const newBudget = Number((next.policies.budget.max_cost_usd_per_run * 1.15).toFixed(2));
    next.policies.budget.max_cost_usd_per_run = newBudget;
    setIfChanged(changes, "policy_change", "policies.budget.max_cost_usd_per_run", beforeBudget, String(newBudget));
  } else if (run.failure_reason?.toLowerCase().includes("latency exceeded")) {
    const beforeLatency = String(next.policies.latency.p95_ms_max);
    const newLatency = Math.round(next.policies.latency.p95_ms_max * 1.1);
    next.policies.latency.p95_ms_max = newLatency;
    setIfChanged(changes, "policy_change", "policies.latency.p95_ms_max", beforeLatency, String(newLatency));

    if (firstExec.mcps.length > 1) {
      const removed = firstExec.mcps[firstExec.mcps.length - 1];
      firstExec.mcps = firstExec.mcps.slice(0, -1);
      changes.push({
        type: "topology_change",
        path: `execution_plane.agents[0].mcps`,
        before: [...firstExec.mcps, removed].join(","),
        after: firstExec.mcps.join(",")
      });
    }
  } else {
    const before = firstExec.model.primary;
    if (before.includes("gpt-5") && !before.includes("mini")) {
      firstExec.model.primary = "openai:gpt-5-mini";
      setIfChanged(changes, "model_change", "execution_plane.agents[0].model.primary", before, firstExec.model.primary);
    } else if (!next.optimization.auto_optimize) {
      next.optimization.auto_optimize = true;
      setIfChanged(
        changes,
        "policy_change",
        "optimization.auto_optimize",
        String(team.optimization.auto_optimize),
        String(next.optimization.auto_optimize)
      );
    }
  }

  if (changes.length === 0) {
    return { applied: false, reason, changes };
  }

  Object.assign(team, next);
  return { applied: true, reason, changes };
}
