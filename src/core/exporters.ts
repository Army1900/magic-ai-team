import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeYamlFile } from "./config";
import { TeamConfig } from "./types";
import { appendWorklogEvent, ensureProjectWorklog } from "./worklog";

export type ExportTarget = "opencode" | "openclaw" | "claude";

export interface ExportResult {
  target: ExportTarget;
  output_dir: string;
  files: string[];
  warnings: string[];
}

interface ExportContext {
  team: TeamConfig;
  outDir: string;
}

function writeJson(filePath: string, data: unknown): string {
  const resolved = path.resolve(filePath);
  ensureDir(path.dirname(resolved));
  fs.writeFileSync(resolved, JSON.stringify(data, null, 2), "utf8");
  return resolved;
}

function commonWarnings(team: TeamConfig): string[] {
  const warnings: string[] = [];
  const highRiskAgents = team.execution_plane.agents.filter((a) => (a.risk_level ?? "low") === "high");
  if (highRiskAgents.length > 0) {
    warnings.push(`High-risk agents present: ${highRiskAgents.map((a) => a.id).join(", ")}`);
  }
  const lowTrustSkills = team.resources.skills.filter(
    (s) => (s.trust_score ?? 0) < team.policies.security.min_skill_trust_score
  );
  if (lowTrustSkills.length > 0) {
    warnings.push(`Low-trust skills present: ${lowTrustSkills.map((s) => s.id).join(", ")}`);
  }
  return warnings;
}

function exportOpencode(ctx: ExportContext): ExportResult {
  const targetDir = path.resolve(ctx.outDir, ".opencode");
  ensureDir(targetDir);
  const files: string[] = [];
  const warnings = commonWarnings(ctx.team);

  files.push(
    writeJson(path.join(targetDir, "team.json"), {
      name: ctx.team.team.name,
      goal: ctx.team.team.goal,
      managers: ctx.team.control_plane.manager_agents,
      agents: ctx.team.execution_plane.agents.map((a) => ({
        id: a.id,
        role: a.role,
        model: a.model.primary,
        fallback_models: a.model.fallback ?? [],
        skills: a.skills,
        mcps: a.mcps
      })),
      skills: ctx.team.resources.skills,
      mcps: ctx.team.resources.mcps,
      policies: ctx.team.policies
    })
  );

  files.push(
    writeJson(path.join(targetDir, "README.opencode.json"), {
      generated_by: "openteam",
      note: "Import team.json into your OpenCode project settings."
    })
  );

  return {
    target: "opencode",
    output_dir: targetDir,
    files,
    warnings
  };
}

function exportOpenclaw(ctx: ExportContext): ExportResult {
  const targetDir = path.resolve(ctx.outDir, ".openclaw");
  ensureDir(targetDir);
  const files: string[] = [];
  const warnings = commonWarnings(ctx.team);

  const clawConfig = {
    version: "1",
    workspace: {
      name: ctx.team.team.name,
      objective: ctx.team.team.goal
    },
    swarm: {
      agents: ctx.team.execution_plane.agents.map((a) => ({
        name: a.id,
        role: a.role,
        model: a.model.primary,
        tools: a.mcps,
        skills: a.skills
      }))
    },
    resources: {
      mcps: ctx.team.resources.mcps,
      skills: ctx.team.resources.skills
    },
    governance: ctx.team.policies
  };

  const yamlPath = path.join(targetDir, "openclaw.team.yaml");
  writeYamlFile(yamlPath, clawConfig);
  files.push(path.resolve(yamlPath));

  return {
    target: "openclaw",
    output_dir: targetDir,
    files,
    warnings
  };
}

function exportClaude(ctx: ExportContext): ExportResult {
  const targetDir = path.resolve(ctx.outDir, ".claude");
  ensureDir(targetDir);
  const files: string[] = [];
  const warnings = commonWarnings(ctx.team);

  files.push(
    writeJson(path.join(targetDir, "agents.json"), {
      team: ctx.team.team.name,
      objective: ctx.team.team.goal,
      agents: ctx.team.execution_plane.agents.map((a) => ({
        id: a.id,
        prompt_role: a.role,
        model: a.model.primary,
        fallback: a.model.fallback ?? [],
        toolchain: a.mcps,
        skills: a.skills,
        contracts: {
          input: a.input_contract,
          output: a.output_contract
        }
      }))
    })
  );

  files.push(
    writeJson(path.join(targetDir, "skills.json"), {
      skills: ctx.team.resources.skills,
      mcps: ctx.team.resources.mcps
    })
  );

  return {
    target: "claude",
    output_dir: targetDir,
    files,
    warnings
  };
}

export function exportTeam(team: TeamConfig, target: ExportTarget, outDir: string): ExportResult {
  ensureProjectWorklog(outDir, { team: team.team.name, note: "initialized during export" });
  const ctx: ExportContext = { team, outDir };
  const result = target === "opencode" ? exportOpencode(ctx) : target === "openclaw" ? exportOpenclaw(ctx) : exportClaude(ctx);
  appendWorklogEvent(outDir, {
    type: "export",
    team: team.team.name,
    status: "ok",
    note: `exported to ${target}`,
    meta: {
      target,
      output_dir: result.output_dir,
      files: result.files,
      warnings: result.warnings
    }
  });
  return result;
}

export function writeExportManifest(baseOutDir: string, result: ExportResult, teamFile: string): string {
  const manifestDir = path.resolve(baseOutDir, ".openteam-export");
  ensureDir(manifestDir);
  const manifestPath = path.join(manifestDir, "manifest.json");
  const payload = {
    exported_at: new Date().toISOString(),
    target: result.target,
    team_file: teamFile,
    output_dir: result.output_dir,
    files: result.files,
    warnings: result.warnings
  };
  fs.writeFileSync(manifestPath, JSON.stringify(payload, null, 2), "utf8");
  return manifestPath;
}
