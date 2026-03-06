import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./config";
import { TeamConfig } from "./types";
import { ExportTarget } from "./targets";

export interface HandoffPackage {
  target: ExportTarget;
  mission: string;
  plan: string[];
  team_intro: string;
  first_task: string;
  success_criteria: string[];
  prompt: string;
}

export interface HandoffPaths {
  root: string;
  brief: string;
  prompt: string;
  meta: string;
}

function summarizeTeam(team: TeamConfig): string {
  const lines: string[] = [];
  lines.push(`Team: ${team.team.name}`);
  lines.push(`Goal: ${team.team.goal}`);
  lines.push("Agents:");
  for (const a of team.execution_plane.agents) {
    lines.push(`- ${a.id}: ${a.role} (model=${a.model.primary})`);
  }
  lines.push("Resources:");
  lines.push(`- skills: ${team.resources.skills.map((s) => s.id).join(", ") || "none"}`);
  lines.push(`- mcps: ${team.resources.mcps.map((m) => m.id).join(", ") || "none"}`);
  return lines.join("\n");
}

function buildPlan(team: TeamConfig): string[] {
  return [
    "Confirm mission, constraints, and approval policy.",
    "Assign the first task to the execution agent set and capture output artifacts.",
    "Run evaluator to score quality/cost/latency against KPIs.",
    "Apply optimizer recommendations only if policy checks pass.",
    "Report progress in project worklog and schedule next iteration."
  ].map((line, i) => `${i + 1}. ${line}`);
}

export function buildHandoffPackage(team: TeamConfig, target: ExportTarget): HandoffPackage {
  const mission = `${team.team.goal}`;
  const plan = buildPlan(team);
  const firstTask =
    team.team.kpis.length > 0
      ? `Start with a task that directly impacts KPI "${team.team.kpis[0].name}" (${team.team.kpis[0].target}).`
      : "Start with a small deliverable that demonstrates measurable value in one run.";
  const successCriteria = [
    "A first-run artifact is produced and reviewed.",
    "Policy gates remain compliant (risk/trust/approval).",
    "Cost and latency are recorded in worklog.",
    "Next action is explicitly assigned."
  ];

  const prompt =
    `You are launching an AI team workflow for target "${target}".\n\n` +
    `Mission:\n${mission}\n\n` +
    `Execution Plan:\n${plan.join("\n")}\n\n` +
    `Team Snapshot:\n${summarizeTeam(team)}\n\n` +
    `First Task:\n${firstTask}\n\n` +
    `Success Criteria:\n${successCriteria.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n` +
    "Start now. Produce an initial plan and execute the first step.";

  return {
    target,
    mission,
    plan,
    team_intro: summarizeTeam(team),
    first_task: firstTask,
    success_criteria: successCriteria,
    prompt
  };
}

export function writeHandoffPackage(projectPath: string, handoff: HandoffPackage): HandoffPaths {
  const root = path.resolve(projectPath, ".openteam", "handoff");
  ensureDir(root);
  const brief = path.join(root, "TEAM_BRIEF.md");
  const prompt = path.join(root, "START_PROMPT.md");
  const meta = path.join(root, "handoff.json");

  const briefBody =
    `# Team Handoff\n\n` +
    `- target: ${handoff.target}\n` +
    `- mission: ${handoff.mission}\n\n` +
    `## Plan\n${handoff.plan.map((p) => `- ${p}`).join("\n")}\n\n` +
    `## Team Intro\n\n` +
    "```\n" +
    `${handoff.team_intro}\n` +
    "```\n\n" +
    `## First Task\n\n${handoff.first_task}\n\n` +
    `## Success Criteria\n${handoff.success_criteria.map((s) => `- ${s}`).join("\n")}\n`;

  fs.writeFileSync(brief, briefBody, "utf8");
  fs.writeFileSync(prompt, `${handoff.prompt}\n`, "utf8");
  fs.writeFileSync(meta, JSON.stringify(handoff, null, 2), "utf8");

  return {
    root,
    brief,
    prompt,
    meta
  };
}
