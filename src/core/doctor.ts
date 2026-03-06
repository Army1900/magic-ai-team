import path from "node:path";
import { fileExists, loadOpenTeamConfig, loadTeamConfig } from "./config";
import { validateTeamConfig } from "./validate";
import { describeProviderAuth } from "./model-providers";

export interface DoctorCheck {
  name: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

function providerFromModel(model: string): string {
  return model.split(":")[0] ?? "";
}

export function runDoctor(teamPath = "team.yaml", openTeamPath = "openteam.yaml"): DoctorCheck[] {
  const checks: DoctorCheck[] = [];

  checks.push({
    name: "team.yaml exists",
    status: fileExists(teamPath) ? "ok" : "fail",
    detail: path.resolve(teamPath)
  });

  checks.push({
    name: "openteam.yaml exists",
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
        name: "openteam.yaml parse",
        status: "fail",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return checks;
}
