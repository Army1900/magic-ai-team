import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./config";
import { RunArtifact, TeamConfig } from "./types";
import { invokeModel } from "./model-providers";
import { loadContextText } from "./context";

function nowIso(): string {
  return new Date().toISOString();
}

function runId(prefix: "run" | "sim"): string {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `${prefix}_${ts}_${rand}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function modelCostPer1kTokens(model: string): number {
  const key = model.toLowerCase();
  if (key.includes("gpt-5-mini")) return 0.002;
  if (key.includes("gpt-5")) return 0.01;
  if (key.includes("claude-sonnet")) return 0.008;
  return 0.006;
}

function chooseBudgetAwareModelOrder(
  models: string[],
  spent: number,
  budget: number,
  onBudgetExceed: string
): { ordered: string[]; downgraded: boolean } {
  if (models.length <= 1 || budget <= 0) {
    return { ordered: models, downgraded: false };
  }
  const shouldDowngrade = onBudgetExceed === "downgrade_model" && spent >= budget * 0.8;
  if (!shouldDowngrade) {
    return { ordered: models, downgraded: false };
  }
  const mini = models.filter((m) => m.toLowerCase().includes("mini"));
  const other = models.filter((m) => !m.toLowerCase().includes("mini"));
  if (mini.length === 0) {
    return { ordered: models, downgraded: false };
  }
  const ordered = [...mini, ...other];
  return { ordered, downgraded: ordered[0] !== models[0] };
}

export function executeTask(team: TeamConfig, task: string, mode: "run" | "simulate"): RunArtifact {
  const taskWeight = clamp(Math.ceil(task.length / 80), 1, 12);
  let totalLatency = 0;
  let totalTokens = 0;
  let totalCost = 0;
  const steps: RunArtifact["steps"] = [];

  for (const agent of team.execution_plane.agents) {
    const baseTokens = 450 + taskWeight * 90;
    const baseLatency = 800 + taskWeight * 180;
    const model = agent.model.primary;
    const tokens = Math.round(baseTokens * (0.8 + Math.random() * 0.5));
    const latency = Math.round(baseLatency * (0.9 + Math.random() * 0.4));
    const cost = Number(((tokens / 1000) * modelCostPer1kTokens(model)).toFixed(4));

    totalLatency += latency;
    totalTokens += tokens;
    totalCost += cost;

    steps.push({
      agent_id: agent.id,
      model,
      status: "ok",
      latency_ms: latency,
      estimated_tokens: tokens,
      estimated_cost_usd: cost,
      output_preview: `${agent.id} produced intermediate output`
    });
  }

  const budget = team.policies.budget.max_cost_usd_per_run;
  const latencyMax = team.policies.latency.p95_ms_max;
  let success = true;
  let failureReason: string | undefined;

  if (totalCost > budget) {
    success = false;
    failureReason = `Budget exceeded: ${totalCost.toFixed(4)} > ${budget.toFixed(4)}`;
  } else if (totalLatency > latencyMax) {
    success = false;
    failureReason = `Latency exceeded: ${totalLatency}ms > ${latencyMax}ms`;
  }

  const artifact: RunArtifact = {
    run_id: runId(mode === "run" ? "run" : "sim"),
    created_at: nowIso(),
    mode,
    task,
    team_id: team.team.id,
    success,
    totals: {
      latency_ms: totalLatency,
      estimated_tokens: totalTokens,
      estimated_cost_usd: Number(totalCost.toFixed(4))
    },
    steps,
    failure_reason: failureReason
  };

  return artifact;
}

export async function executeTaskWithModels(
  team: TeamConfig,
  task: string,
  executionMode: "mock" | "live"
): Promise<RunArtifact> {
  let totalLatency = 0;
  let totalTokens = 0;
  let totalCost = 0;
  const steps: RunArtifact["steps"] = [];
  let pipelineSuccess = true;
  let failureReason: string | undefined;
  let currentInput = task;
  const contextText = loadContextText(team);
  const budget = team.policies.budget.max_cost_usd_per_run;
  const warnThreshold = Number((budget * 0.8).toFixed(4));
  const budgetAlerts: string[] = [];
  let downgradeActions = 0;

  for (const agent of team.execution_plane.agents) {
    const baseModels = [agent.model.primary, ...(agent.model.fallback ?? [])];
    if (totalCost >= warnThreshold) {
      budgetAlerts.push(
        `budget warning before agent '${agent.id}': spent=${totalCost.toFixed(4)}, threshold=${warnThreshold.toFixed(4)}`
      );
    }
    const budgetModelPlan = chooseBudgetAwareModelOrder(
      baseModels,
      totalCost,
      budget,
      String(team.fallback.on_budget_exceed ?? "")
    );
    if (budgetModelPlan.downgraded) {
      downgradeActions += 1;
      budgetAlerts.push(
        `downgrade applied for agent '${agent.id}': ${baseModels[0]} -> ${budgetModelPlan.ordered[0]}`
      );
    }
    const tryModels = budgetModelPlan.ordered;
    let done = false;
    const errors: string[] = [];

    for (const model of tryModels) {
      try {
        const result = await invokeModel(
          {
            model,
            prompt:
              `Role: ${agent.role}\n` +
              `Input: ${currentInput}\n` +
              (contextText ? `Team Context:\n${contextText}\n` : "") +
              `Produce output for ${agent.output_contract}.`
          },
          executionMode
        );
        totalLatency += result.latency_ms;
        totalTokens += result.tokens;
        totalCost += result.estimated_cost_usd;
        steps.push({
          agent_id: agent.id,
          model,
          budget_action: budgetModelPlan.downgraded && model === tryModels[0] ? "downgraded" : "none",
          status: "ok",
          latency_ms: result.latency_ms,
          estimated_tokens: result.tokens,
          estimated_cost_usd: result.estimated_cost_usd,
          output_preview: result.text.slice(0, 120)
        });
        currentInput = result.text || `${agent.id} completed`;
        done = true;
        break;
      } catch (error) {
        const err = error instanceof Error ? error.message : String(error);
        errors.push(`${model}: ${err}`);
      }
    }

    if (!done) {
      pipelineSuccess = false;
      const errorSummary = errors.join(" | ");
      failureReason = `Agent '${agent.id}' failed after fallback attempts: ${errorSummary}`;
      steps.push({
        agent_id: agent.id,
        model: tryModels[0] ?? "unknown",
        budget_action: budgetModelPlan.downgraded ? "downgraded" : "none",
        status: "fail",
        latency_ms: 0,
        estimated_tokens: 0,
        estimated_cost_usd: 0,
        output_preview: errorSummary.slice(0, 120)
      });
      break;
    }
  }

  const latencyMax = team.policies.latency.p95_ms_max;
  if (pipelineSuccess && totalCost > budget) {
    pipelineSuccess = false;
    failureReason = `Budget exceeded: ${totalCost.toFixed(4)} > ${budget.toFixed(4)}`;
  }
  if (pipelineSuccess && totalLatency > latencyMax) {
    pipelineSuccess = false;
    failureReason = `Latency exceeded: ${totalLatency}ms > ${latencyMax}ms`;
  }

  return {
    run_id: runId("run"),
    created_at: nowIso(),
    mode: "run",
    task,
    team_id: team.team.id,
    success: pipelineSuccess,
    totals: {
      latency_ms: totalLatency,
      estimated_tokens: totalTokens,
      estimated_cost_usd: Number(totalCost.toFixed(4))
    },
    budget_monitor: {
      budget_usd: Number(budget.toFixed(4)),
      warn_threshold_usd: warnThreshold,
      alerts: budgetAlerts,
      downgrade_actions: downgradeActions
    },
    steps,
    failure_reason: failureReason
  };
}

export function saveRunArtifact(artifact: RunArtifact, runsDir: string): string {
  ensureDir(runsDir);
  const outPath = path.resolve(runsDir, `${artifact.run_id}.json`);
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2), "utf8");
  return outPath;
}

export function loadRunArtifact(runIdOrPath: string, runsDir: string): RunArtifact {
  const isPath = runIdOrPath.includes(".json") || runIdOrPath.includes("/") || runIdOrPath.includes("\\");
  const resolved = isPath ? path.resolve(runIdOrPath) : path.resolve(runsDir, `${runIdOrPath}.json`);
  const raw = fs.readFileSync(resolved, "utf8");
  return JSON.parse(raw) as RunArtifact;
}
