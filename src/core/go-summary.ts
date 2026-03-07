export type GoPhase = "up" | "export" | "handoff" | "start";
export type PhaseState = "queued" | "running" | "done" | "fallback" | "failed";

export interface GoPhaseEvent {
  phase: GoPhase;
  state: PhaseState;
  ts: string;
  elapsed_ms?: number;
  detail?: string;
}

export interface GoTopIssue {
  code: string;
  message: string;
}

export interface GoSummaryInput {
  readyToStart: boolean;
  qualityOverall: number;
  qualityWarns: number;
  scannerWarns: number;
  scannerFails: number;
  changes: {
    agents: number;
    skills: number;
    mcps: number;
  };
  phaseTimeline: GoPhaseEvent[];
  topIssues: GoTopIssue[];
  quickFixes: string[];
}

export interface GoSummary {
  ready_to_start: boolean;
  quality_overall: number;
  quality_warns: number;
  scanner_warns: number;
  scanner_fails: number;
  changes: {
    agents: number;
    skills: number;
    mcps: number;
  };
  phase_durations_ms: Partial<Record<GoPhase, number>>;
  top_issues: GoTopIssue[];
  quick_fixes: string[];
}

export function buildGoSummary(input: GoSummaryInput): GoSummary {
  const phaseDurations: Partial<Record<GoPhase, number>> = {};
  const phases: GoPhase[] = ["up", "export", "handoff", "start"];
  for (const phase of phases) {
    const event = [...input.phaseTimeline].reverse().find((e) => e.phase === phase && typeof e.elapsed_ms === "number");
    if (event && typeof event.elapsed_ms === "number") {
      phaseDurations[phase] = event.elapsed_ms;
    }
  }

  return {
    ready_to_start: input.readyToStart,
    quality_overall: input.qualityOverall,
    quality_warns: input.qualityWarns,
    scanner_warns: input.scannerWarns,
    scanner_fails: input.scannerFails,
    changes: input.changes,
    phase_durations_ms: phaseDurations,
    top_issues: input.topIssues.slice(0, 3),
    quick_fixes: input.quickFixes.slice(0, 3)
  };
}

