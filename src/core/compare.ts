import { TeamConfig } from "./types";

export interface CompareItem {
  field: string;
  a: string;
  b: string;
}

function models(config: TeamConfig): string[] {
  return config.execution_plane.agents.map((a) => `${a.id}:${a.model.primary}`);
}

export function compareTeams(a: TeamConfig, b: TeamConfig): CompareItem[] {
  const diffs: CompareItem[] = [];

  if (a.team.goal !== b.team.goal) {
    diffs.push({ field: "team.goal", a: a.team.goal, b: b.team.goal });
  }

  if (a.execution_plane.agents.length !== b.execution_plane.agents.length) {
    diffs.push({
      field: "execution_plane.agents.length",
      a: String(a.execution_plane.agents.length),
      b: String(b.execution_plane.agents.length)
    });
  }

  const modelsA = models(a).join(", ");
  const modelsB = models(b).join(", ");
  if (modelsA !== modelsB) {
    diffs.push({ field: "execution_plane.agent_models", a: modelsA, b: modelsB });
  }

  const budgetA = String(a.policies.budget.max_cost_usd_per_run);
  const budgetB = String(b.policies.budget.max_cost_usd_per_run);
  if (budgetA !== budgetB) {
    diffs.push({ field: "policies.budget.max_cost_usd_per_run", a: budgetA, b: budgetB });
  }

  const latencyA = String(a.policies.latency.p95_ms_max);
  const latencyB = String(b.policies.latency.p95_ms_max);
  if (latencyA !== latencyB) {
    diffs.push({ field: "policies.latency.p95_ms_max", a: latencyA, b: latencyB });
  }

  const autoA = String(a.optimization.auto_optimize);
  const autoB = String(b.optimization.auto_optimize);
  if (autoA !== autoB) {
    diffs.push({ field: "optimization.auto_optimize", a: autoA, b: autoB });
  }

  return diffs;
}
