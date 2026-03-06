import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./config";
import { EvalReport, RunArtifact, TeamConfig } from "./types";

function scoreFromThreshold(actual: number, target: number, lowerIsBetter = true): number {
  if (target <= 0) return 50;
  const ratio = lowerIsBetter ? target / Math.max(actual, 1) : actual / target;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

function reportId(runId: string): string {
  return `eval_${runId}`;
}

export function evaluateRun(team: TeamConfig, run: RunArtifact): EvalReport {
  const budgetTarget = team.policies.budget.max_cost_usd_per_run;
  const latencyTarget = team.policies.latency.p95_ms_max;

  const quality = run.success ? 85 : 55;
  const reliability = run.success ? 90 : 40;
  const costScore = scoreFromThreshold(run.totals.estimated_cost_usd, budgetTarget, true);
  const latencyScore = scoreFromThreshold(run.totals.latency_ms, latencyTarget, true);
  const overall = Math.round((quality * 0.35 + reliability * 0.35 + costScore * 0.15 + latencyScore * 0.15));

  const recommendations: string[] = [];
  if (!run.success && run.failure_reason) {
    recommendations.push(`Investigate failure: ${run.failure_reason}`);
  }
  if (run.totals.estimated_cost_usd > budgetTarget * 0.8) {
    recommendations.push("Consider downgrading one agent to a lower-cost model.");
  }
  if (run.totals.latency_ms > latencyTarget * 0.8) {
    recommendations.push("Reduce tool calls or split long prompts to improve latency.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Current setup is healthy. Proceed to A/B testing before production.");
  }

  return {
    report_id: reportId(run.run_id),
    created_at: new Date().toISOString(),
    run_id: run.run_id,
    summary: {
      quality_score: quality,
      reliability_score: reliability,
      cost_efficiency_score: costScore,
      overall_score: overall
    },
    observed: {
      success: run.success,
      total_latency_ms: run.totals.latency_ms,
      total_cost_usd: run.totals.estimated_cost_usd,
      total_tokens: run.totals.estimated_tokens
    },
    recommendations
  };
}

export function saveEvalReport(report: EvalReport, reportsDir: string): string {
  ensureDir(reportsDir);
  const outPath = path.resolve(reportsDir, `${report.report_id}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  return outPath;
}
