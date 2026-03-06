import { Command } from "commander";
import { loadOrCreateOpenTeamConfig, saveOpenTeamConfig } from "../core/marketplace";
import { error, info, listThemes, resolveTheme, success } from "../core/ui";

export function registerThemeCommand(program: Command): void {
  const cmd = program.command("theme").description("Manage CLI color themes");

  cmd
    .command("list")
    .description("List available themes")
    .action(() => {
      info("Available themes:");
      for (const name of listThemes()) {
        console.log(`- ${name}`);
      }
    });

  cmd
    .command("set")
    .description("Set default theme in openteam.yaml")
    .requiredOption("--name <theme>", "theme name")
    .option("-c, --config <path>", "openteam config path", "openteam.yaml")
    .action((options) => {
      const normalized = resolveTheme(options.name);
      if (normalized !== options.name.toLowerCase()) {
        error(`Unknown theme '${options.name}'. Use: openteam theme list`);
        process.exitCode = 1;
        return;
      }
      const cfg = loadOrCreateOpenTeamConfig(options.config);
      cfg.ui = cfg.ui ?? {};
      cfg.ui.theme = normalized;
      saveOpenTeamConfig(cfg, options.config);
      success(`Theme set: ${normalized}`);
    });
}
