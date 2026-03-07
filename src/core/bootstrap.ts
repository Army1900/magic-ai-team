import { fileExists, resolveHomeOpenTeamConfigPath } from "./config";
import { ensureOpenTeamHome } from "./home";
import { loadOrCreateOpenTeamConfig } from "./marketplace";

export interface BootstrapResult {
  home: string;
  home_config_path: string;
  created_home_config: boolean;
}

export function bootstrapRuntimeEnvironment(): BootstrapResult {
  const home = ensureOpenTeamHome();
  const homeConfigPath = resolveHomeOpenTeamConfigPath();
  const createdHomeConfig = !fileExists(homeConfigPath);
  loadOrCreateOpenTeamConfig(homeConfigPath);
  return {
    home,
    home_config_path: homeConfigPath,
    created_home_config: createdHomeConfig
  };
}
