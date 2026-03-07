import path from "node:path";
import { fileExists, loadOpenTeamConfig, loadTeamConfig, resolveHomeOpenTeamConfigPath } from "./config";
import { validateTeamConfig } from "./validate";
import { describeProviderAuth } from "./model-providers";
import { ExportTarget, normalizeExportTarget } from "./targets";
import { checkTargetCompatibility } from "./compatibility";
import { getLauncherHealth } from "./launchers";

export interface DoctorCheck {
  name: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

function providerFromModel(model: string): string {
  return model.split(":")[0] ?? "";
}

export function runDoctor(teamPath = "team.yaml", openTeamPath = resolveHomeOpenTeamConfigPath(), target?: string): DoctorCheck[] {
  const checks: DoctorCheck[] = [];

  checks.push({
    name: "team.yaml exists",
    status: fileExists(teamPath) ? "ok" : "fail",
    detail: path.resolve(teamPath)
  });

  checks.push({
    name: "OpenTeam config exists",
    status: fileExists(openTeamPath) ? "ok" : "warn",
    detail: path.resolve(openTeamPath)
  });

  if (!fileExists(teamPath)) {
    return checks;
  }

  try {
    const teamConfig = loadTeamConfig(teamPath);
    const validation = validateTeamConfig(teamConfig);
    checks.push({
      name: "team.yaml schema",
      status: validation.valid ? "ok" : "fail",
      detail: validation.valid ? "schema valid" : validation.errors.join("; ")
    });
    if (validation.valid && validation.warnings.length > 0) {
      checks.push({
        name: "team.yaml strictness",
        status: "warn",
        detail: validation.warnings.join("; ")
      });
    }

    const models = new Set<string>();
    for (const manager of teamConfig.control_plane.manager_agents) {
      models.add(manager.model);
    }
    for (const agent of teamConfig.execution_plane.agents) {
      models.add(agent.model.primary);
      for (const fb of agent.model.fallback ?? []) {
        models.add(fb);
      }
    }

    for (const model of models) {
      const provider = providerFromModel(model);
      if (provider !== "openai" && provider !== "anthropic") {
        checks.push({
          name: `provider env (${provider})`,
          status: "warn",
          detail: `No default env mapping for model '${model}'`
        });
        continue;
      }

      const auth = describeProviderAuth(model);
      checks.push({
        name: `provider env (${provider})`,
        status: auth.ok ? "ok" : "warn",
        detail: auth.detail
      });
    }

    if (target) {
      let normalized: ExportTarget;
      try {
        normalized = normalizeExportTarget(target);
      } catch (error) {
        checks.push({
          name: "target option",
          status: "fail",
          detail: error instanceof Error ? error.message : String(error)
        });
        return checks;
      }

      const compat = checkTargetCompatibility(teamConfig, normalized);
      const fails = compat.findings.filter((f) => f.severity === "fail");
      const warns = compat.findings.filter((f) => f.severity === "warn");
      checks.push({
        name: `target compatibility (${normalized})`,
        status: fails.length > 0 ? "fail" : warns.length > 0 ? "warn" : "ok",
        detail:
          fails.length > 0
            ? `${fails.length} fail, ${warns.length} warn`
            : warns.length > 0
            ? `${warns.length} warn`
            : "compatible"
      });

      const launcher = getLauncherHealth(normalized);
      checks.push({
        name: `launcher (${normalized})`,
        status: launcher.available ? "ok" : "warn",
        detail: launcher.available ? `${launcher.command} found` : `${launcher.command} missing`
      });
      checks.push({
        name: `run-mode support (${normalized})`,
        status: launcher.supports_stdin_run ? "ok" : "warn",
        detail: launcher.supports_stdin_run
          ? "supports --run stdin injection"
          : "does not support --run stdin injection"
      });
    }
  } catch (error) {
    checks.push({
      name: "team.yaml parse",
      status: "fail",
      detail: error instanceof Error ? error.message : String(error)
    });
  }

  if (fileExists(openTeamPath)) {
    try {
      const cfg = loadOpenTeamConfig(openTeamPath);
      checks.push({
        name: "marketplaces configured",
        status: cfg.marketplaces.length > 0 ? "ok" : "warn",
        detail: `${cfg.marketplaces.length} marketplaces`
      });
    } catch (error) {
      checks.push({
        name: "OpenTeam config parse",
        status: "fail",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return checks;
}
