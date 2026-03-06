import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeYamlFile } from "./config";
import { TeamConfig } from "./types";
import { appendWorklogEvent, ensureProjectWorklog } from "./worklog";

export type ExportTarget =
  | "opencode"
  | "openclaw"
  | "claude"
  | "codex"
  | "aider"
  | "continue"
  | "cline"
  | "openhands"
  | "tabby";

export interface ExportResult {
  target: ExportTarget;
  output_dir: string;
  files: string[];
  warnings: string[];
}

export interface TargetValidationFinding {
  severity: "warn" | "fail";
  code: string;
  message: string;
}

export interface TargetValidationResult {
  target: ExportTarget;
  findings: TargetValidationFinding[];
}

interface ExportContext {
  team: TeamConfig;
  outDir: string;
}

interface McpAdapterRecord {
  id: string;
  source: string;
  version: string;
  auth?: string;
  permissions: string[];
  risk_level?: string;
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

function toMcpAdapterRecords(team: TeamConfig): McpAdapterRecord[] {
  return team.resources.mcps.map((m) => ({
    id: m.id,
    source: m.source,
    version: m.version,
    auth: m.auth,
    permissions: m.permissions ?? [],
    risk_level: m.risk_level
  }));
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

  files.push(
    writeJson(path.join(targetDir, "mcp.json"), {
      generated_by: "openteam",
      note: "MCP adapter config for opencode target",
      mcps: toMcpAdapterRecords(ctx.team)
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
  const mcpYaml = path.join(targetDir, "mcp.openclaw.yaml");
  writeYamlFile(mcpYaml, {
    generated_by: "openteam",
    mcps: toMcpAdapterRecords(ctx.team)
  });
  files.push(path.resolve(mcpYaml));

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

  files.push(
    writeJson(path.join(targetDir, "mcp.json"), {
      generated_by: "openteam",
      note: "MCP adapter config for claude target",
      mcps: toMcpAdapterRecords(ctx.team)
    })
  );

  return {
    target: "claude",
    output_dir: targetDir,
    files,
    warnings
  };
}

function exportCodex(ctx: ExportContext): ExportResult {
  const targetDir = path.resolve(ctx.outDir, ".codex");
  ensureDir(targetDir);
  const files: string[] = [];
  const warnings = commonWarnings(ctx.team);

  files.push(
    writeJson(path.join(targetDir, "agents.json"), {
      team: {
        name: ctx.team.team.name,
        goal: ctx.team.team.goal
      },
      agents: ctx.team.execution_plane.agents.map((a) => ({
        id: a.id,
        role: a.role,
        model: a.model.primary,
        fallbacks: a.model.fallback ?? [],
        skills: a.skills,
        mcps: a.mcps
      }))
    })
  );

  files.push(
    writeJson(path.join(targetDir, "skills.json"), {
      skills: ctx.team.resources.skills,
      mcps: ctx.team.resources.mcps
    })
  );

  files.push(
    writeJson(path.join(targetDir, "codex.team.json"), {
      generated_by: "openteam",
      schema: "codex.team.v1",
      policies: ctx.team.policies,
      context_docs: ctx.team.context_docs ?? []
    })
  );

  files.push(
    writeJson(path.join(targetDir, "mcp.json"), {
      generated_by: "openteam",
      note: "MCP adapter config for codex target",
      mcps: toMcpAdapterRecords(ctx.team)
    })
  );

  return {
    target: "codex",
    output_dir: targetDir,
    files,
    warnings
  };
}

function exportAider(ctx: ExportContext): ExportResult {
  const targetDir = path.resolve(ctx.outDir, ".aider");
  ensureDir(targetDir);
  const files: string[] = [];
  const warnings = commonWarnings(ctx.team);

  files.push(
    writeJson(path.join(targetDir, "aider.team.json"), {
      team: ctx.team.team,
      agents: ctx.team.execution_plane.agents.map((a) => ({
        id: a.id,
        role: a.role,
        model: a.model.primary,
        fallback_models: a.model.fallback ?? [],
        skills: a.skills,
        mcps: a.mcps
      })),
      policies: ctx.team.policies
    })
  );
  files.push(
    writeJson(path.join(targetDir, "mcp.json"), {
      generated_by: "openteam",
      note: "MCP adapter config for aider target",
      mcps: toMcpAdapterRecords(ctx.team)
    })
  );
  return {
    target: "aider",
    output_dir: targetDir,
    files,
    warnings
  };
}

function exportContinue(ctx: ExportContext): ExportResult {
  const targetDir = path.resolve(ctx.outDir, ".continue");
  ensureDir(targetDir);
  const files: string[] = [];
  const warnings = commonWarnings(ctx.team);

  const configPath = path.join(targetDir, "config.yaml");
  writeYamlFile(configPath, {
    generated_by: "openteam",
    title: ctx.team.team.name,
    models: ctx.team.execution_plane.agents.map((a) => ({
      title: `${a.id}-${a.model.primary}`,
      model: a.model.primary,
      provider: a.model.primary.split(":")[0]
    })),
    context_docs: ctx.team.context_docs ?? []
  });
  files.push(path.resolve(configPath));
  files.push(
    writeJson(path.join(targetDir, "mcp.json"), {
      generated_by: "openteam",
      note: "MCP adapter config for continue target",
      mcps: toMcpAdapterRecords(ctx.team)
    })
  );
  return {
    target: "continue",
    output_dir: targetDir,
    files,
    warnings
  };
}

function exportCline(ctx: ExportContext): ExportResult {
  const targetDir = path.resolve(ctx.outDir, ".cline");
  ensureDir(targetDir);
  const files: string[] = [];
  const warnings = commonWarnings(ctx.team);

  files.push(
    writeJson(path.join(targetDir, "agents.json"), {
      team: ctx.team.team,
      agents: ctx.team.execution_plane.agents.map((a) => ({
        id: a.id,
        role: a.role,
        model: a.model.primary,
        tools: a.mcps,
        skills: a.skills
      }))
    })
  );
  files.push(
    writeJson(path.join(targetDir, "mcp.json"), {
      generated_by: "openteam",
      note: "MCP adapter config for cline target",
      mcps: toMcpAdapterRecords(ctx.team)
    })
  );
  return {
    target: "cline",
    output_dir: targetDir,
    files,
    warnings
  };
}

function exportOpenhands(ctx: ExportContext): ExportResult {
  const targetDir = path.resolve(ctx.outDir, ".openhands");
  ensureDir(targetDir);
  const files: string[] = [];
  const warnings = commonWarnings(ctx.team);

  files.push(
    writeJson(path.join(targetDir, "workflow.json"), {
      generated_by: "openteam",
      team: ctx.team.team,
      agents: ctx.team.execution_plane.agents.map((a) => ({
        id: a.id,
        role: a.role,
        model: a.model.primary,
        tools: a.mcps,
        skills: a.skills
      })),
      policies: ctx.team.policies
    })
  );
  files.push(
    writeJson(path.join(targetDir, "mcp.json"), {
      generated_by: "openteam",
      note: "MCP adapter config for openhands target",
      mcps: toMcpAdapterRecords(ctx.team)
    })
  );
  return {
    target: "openhands",
    output_dir: targetDir,
    files,
    warnings
  };
}

function exportTabby(ctx: ExportContext): ExportResult {
  const targetDir = path.resolve(ctx.outDir, ".tabby");
  ensureDir(targetDir);
  const files: string[] = [];
  const warnings = commonWarnings(ctx.team);

  files.push(
    writeJson(path.join(targetDir, "tabby.team.json"), {
      generated_by: "openteam",
      team: ctx.team.team,
      chat_profiles: ctx.team.execution_plane.agents.map((a) => ({
        id: a.id,
        role: a.role,
        model: a.model.primary
      })),
      context_docs: ctx.team.context_docs ?? []
    })
  );
  files.push(
    writeJson(path.join(targetDir, "mcp.json"), {
      generated_by: "openteam",
      note: "MCP adapter config for tabby target",
      mcps: toMcpAdapterRecords(ctx.team)
    })
  );
  return {
    target: "tabby",
    output_dir: targetDir,
    files,
    warnings
  };
}

function hasFile(paths: string[], endsWithName: string): boolean {
  return paths.some((p) => p.replace(/\\/g, "/").endsWith(endsWithName));
}

export function validateExportResult(result: ExportResult): TargetValidationResult {
  const findings: TargetValidationFinding[] = [];
  if (!result.files.length) {
    findings.push({
      severity: "fail",
      code: "TARGET_EXPORT_EMPTY",
      message: "no files generated"
    });
    return { target: result.target, findings };
  }

  if (result.target === "opencode") {
    if (!hasFile(result.files, "/.opencode/team.json")) {
      findings.push({ severity: "fail", code: "OPENCODE_TEAM_JSON_MISSING", message: "missing .opencode/team.json" });
    }
    if (!hasFile(result.files, "/.opencode/mcp.json")) {
      findings.push({ severity: "warn", code: "OPENCODE_MCP_CONFIG_MISSING", message: "missing .opencode/mcp.json" });
    }
  }
  if (result.target === "openclaw") {
    if (!hasFile(result.files, "/.openclaw/openclaw.team.yaml")) {
      findings.push({ severity: "fail", code: "OPENCLAW_TEAM_YAML_MISSING", message: "missing .openclaw/openclaw.team.yaml" });
    }
    if (!hasFile(result.files, "/.openclaw/mcp.openclaw.yaml")) {
      findings.push({ severity: "warn", code: "OPENCLAW_MCP_CONFIG_MISSING", message: "missing .openclaw/mcp.openclaw.yaml" });
    }
  }
  if (result.target === "claude") {
    if (!hasFile(result.files, "/.claude/agents.json")) {
      findings.push({ severity: "fail", code: "CLAUDE_AGENTS_MISSING", message: "missing .claude/agents.json" });
    }
    if (!hasFile(result.files, "/.claude/skills.json")) {
      findings.push({ severity: "fail", code: "CLAUDE_SKILLS_MISSING", message: "missing .claude/skills.json" });
    }
    if (!hasFile(result.files, "/.claude/mcp.json")) {
      findings.push({ severity: "warn", code: "CLAUDE_MCP_CONFIG_MISSING", message: "missing .claude/mcp.json" });
    }
  }
  if (result.target === "codex") {
    if (!hasFile(result.files, "/.codex/agents.json")) {
      findings.push({ severity: "fail", code: "CODEX_AGENTS_MISSING", message: "missing .codex/agents.json" });
    }
    if (!hasFile(result.files, "/.codex/skills.json")) {
      findings.push({ severity: "fail", code: "CODEX_SKILLS_MISSING", message: "missing .codex/skills.json" });
    }
    if (!hasFile(result.files, "/.codex/codex.team.json")) {
      findings.push({ severity: "warn", code: "CODEX_TEAM_META_MISSING", message: "missing .codex/codex.team.json" });
    }
    if (!hasFile(result.files, "/.codex/mcp.json")) {
      findings.push({ severity: "warn", code: "CODEX_MCP_CONFIG_MISSING", message: "missing .codex/mcp.json" });
    }
  }
  if (result.target === "aider") {
    if (!hasFile(result.files, "/.aider/aider.team.json")) {
      findings.push({ severity: "fail", code: "AIDER_TEAM_CONFIG_MISSING", message: "missing .aider/aider.team.json" });
    }
    if (!hasFile(result.files, "/.aider/mcp.json")) {
      findings.push({ severity: "warn", code: "AIDER_MCP_CONFIG_MISSING", message: "missing .aider/mcp.json" });
    }
  }
  if (result.target === "continue") {
    if (!hasFile(result.files, "/.continue/config.yaml")) {
      findings.push({ severity: "fail", code: "CONTINUE_CONFIG_MISSING", message: "missing .continue/config.yaml" });
    }
    if (!hasFile(result.files, "/.continue/mcp.json")) {
      findings.push({ severity: "warn", code: "CONTINUE_MCP_CONFIG_MISSING", message: "missing .continue/mcp.json" });
    }
  }
  if (result.target === "cline") {
    if (!hasFile(result.files, "/.cline/agents.json")) {
      findings.push({ severity: "fail", code: "CLINE_AGENTS_MISSING", message: "missing .cline/agents.json" });
    }
    if (!hasFile(result.files, "/.cline/mcp.json")) {
      findings.push({ severity: "warn", code: "CLINE_MCP_CONFIG_MISSING", message: "missing .cline/mcp.json" });
    }
  }
  if (result.target === "openhands") {
    if (!hasFile(result.files, "/.openhands/workflow.json")) {
      findings.push({ severity: "fail", code: "OPENHANDS_WORKFLOW_MISSING", message: "missing .openhands/workflow.json" });
    }
    if (!hasFile(result.files, "/.openhands/mcp.json")) {
      findings.push({ severity: "warn", code: "OPENHANDS_MCP_CONFIG_MISSING", message: "missing .openhands/mcp.json" });
    }
  }
  if (result.target === "tabby") {
    if (!hasFile(result.files, "/.tabby/tabby.team.json")) {
      findings.push({ severity: "fail", code: "TABBY_TEAM_CONFIG_MISSING", message: "missing .tabby/tabby.team.json" });
    }
    if (!hasFile(result.files, "/.tabby/mcp.json")) {
      findings.push({ severity: "warn", code: "TABBY_MCP_CONFIG_MISSING", message: "missing .tabby/mcp.json" });
    }
  }

  return { target: result.target, findings };
}

export function exportTeam(team: TeamConfig, target: ExportTarget, outDir: string): ExportResult {
  ensureProjectWorklog(outDir, { team: team.team.name, note: "initialized during export" });
  const ctx: ExportContext = { team, outDir };
  const result =
    target === "opencode"
      ? exportOpencode(ctx)
      : target === "openclaw"
      ? exportOpenclaw(ctx)
      : target === "codex"
      ? exportCodex(ctx)
      : target === "aider"
      ? exportAider(ctx)
      : target === "continue"
      ? exportContinue(ctx)
      : target === "cline"
      ? exportCline(ctx)
      : target === "openhands"
      ? exportOpenhands(ctx)
      : target === "tabby"
      ? exportTabby(ctx)
      : exportClaude(ctx);
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
