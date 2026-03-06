import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./config";

export interface ProgressReportData {
  generated_at: string;
  project: string;
  since: string;
  team: string;
  total_events: number;
  status_summary: string;
  type_breakdown: string;
  overall_plan: string;
  kpi_summary: string;
  risk_level: string;
  blockers_owner: string;
  agent_completed: string;
  progress: string;
  todo: string;
}

const DEFAULT_PROGRESS_TEMPLATE = `# Team Progress Report

Generated At: {{generated_at}}
Project: {{project}}
Time Window: {{since}}
Team: {{team}}

## Overall Plan
{{overall_plan}}

## Business KPI
{{kpi_summary}}

## Risk Level
{{risk_level}}

## Blockers Owner
{{blockers_owner}}

## Agent Completed Work
{{agent_completed}}

## Progress Summary
Total Events: {{total_events}}
Status: {{status_summary}}
Type Breakdown:
{{type_breakdown}}

## Current Progress
{{progress}}

## TODO Next
{{todo}}
`;

export function getProgressTemplatePath(projectPath: string): string {
  return path.resolve(projectPath, ".openteam", "templates", "progress-report.md");
}

export function ensureProgressTemplate(projectPath: string): string {
  const templatePath = getProgressTemplatePath(projectPath);
  ensureDir(path.dirname(templatePath));
  if (!fs.existsSync(templatePath)) {
    fs.writeFileSync(templatePath, DEFAULT_PROGRESS_TEMPLATE, "utf8");
  }
  return templatePath;
}

export function readProgressTemplate(projectPath: string): string {
  const templatePath = ensureProgressTemplate(projectPath);
  return fs.readFileSync(templatePath, "utf8");
}

export function renderWithPlaceholders(template: string, values: Record<string, string>): string {
  let out = template;
  return out.replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (full, key) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : full;
  });
}

export function renderProgressReport(
  template: string,
  data: ProgressReportData,
  extraPlaceholders?: Record<string, string>
): string {
  const values: Record<string, string> = {
    generated_at: data.generated_at,
    project: data.project,
    since: data.since,
    team: data.team,
    total_events: String(data.total_events),
    status_summary: data.status_summary,
    type_breakdown: data.type_breakdown,
    overall_plan: data.overall_plan,
    kpi_summary: data.kpi_summary,
    risk_level: data.risk_level,
    blockers_owner: data.blockers_owner,
    agent_completed: data.agent_completed,
    progress: data.progress,
    todo: data.todo,
    ...(extraPlaceholders ?? {})
  };
  return renderWithPlaceholders(template, values);
}
