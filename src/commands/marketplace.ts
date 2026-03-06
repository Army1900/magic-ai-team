import { Command } from "commander";
import {
  addMarketplace,
  loadOrCreateOpenTeamConfig,
  removeMarketplace,
  saveOpenTeamConfig,
  setMarketplaceEnabled,
  syncMarketplaces
} from "../core/marketplace";
import { banner, error, info, status, success } from "../core/ui";

export function registerMarketplaceCommand(program: Command): void {
  const cmd = program.command("marketplace").description("Manage marketplace sources");

  cmd
    .command("list")
    .description("List configured marketplaces")
    .option("-c, --config <path>", "openteam config path", "openteam.yaml")
    .action((options) => {
      const cfg = loadOrCreateOpenTeamConfig(options.config);
      if (cfg.marketplaces.length === 0) {
        info("No marketplaces configured.");
        return;
      }
      banner("Marketplaces", `${cfg.marketplaces.length} source(s)`);
      for (const m of cfg.marketplaces) {
        status(m.enabled ? "ok" : "warn", `${m.id} (${m.kind})`, m.url);
      }
    });

  cmd
    .command("add")
    .description("Add a marketplace source")
    .requiredOption("--id <id>", "marketplace id")
    .requiredOption("--kind <kind>", "official|github|private")
    .requiredOption("--url <url>", "marketplace url")
    .option("-c, --config <path>", "openteam config path", "openteam.yaml")
    .action((options) => {
      const cfg = loadOrCreateOpenTeamConfig(options.config);
      const ok = addMarketplace(cfg, {
        id: options.id,
        kind: options.kind,
        url: options.url,
        enabled: true
      });
      if (!ok) {
        error("Marketplace already exists (same id or url).");
        process.exitCode = 1;
        return;
      }
      saveOpenTeamConfig(cfg, options.config);
      success(`Added marketplace: ${options.id}`);
    });

  cmd
    .command("remove")
    .description("Remove a marketplace source")
    .requiredOption("--id <id>", "marketplace id")
    .option("-c, --config <path>", "openteam config path", "openteam.yaml")
    .action((options) => {
      const cfg = loadOrCreateOpenTeamConfig(options.config);
      const ok = removeMarketplace(cfg, options.id);
      if (!ok) {
        error(`Marketplace not found: ${options.id}`);
        process.exitCode = 1;
        return;
      }
      saveOpenTeamConfig(cfg, options.config);
      success(`Removed marketplace: ${options.id}`);
    });

  cmd
    .command("enable")
    .description("Enable a marketplace source")
    .requiredOption("--id <id>", "marketplace id")
    .option("-c, --config <path>", "openteam config path", "openteam.yaml")
    .action((options) => {
      const cfg = loadOrCreateOpenTeamConfig(options.config);
      const ok = setMarketplaceEnabled(cfg, options.id, true);
      if (!ok) {
        error(`Marketplace not found: ${options.id}`);
        process.exitCode = 1;
        return;
      }
      saveOpenTeamConfig(cfg, options.config);
      success(`Enabled marketplace: ${options.id}`);
    });

  cmd
    .command("disable")
    .description("Disable a marketplace source")
    .requiredOption("--id <id>", "marketplace id")
    .option("-c, --config <path>", "openteam config path", "openteam.yaml")
    .action((options) => {
      const cfg = loadOrCreateOpenTeamConfig(options.config);
      const ok = setMarketplaceEnabled(cfg, options.id, false);
      if (!ok) {
        error(`Marketplace not found: ${options.id}`);
        process.exitCode = 1;
        return;
      }
      saveOpenTeamConfig(cfg, options.config);
      success(`Disabled marketplace: ${options.id}`);
    });

  cmd
    .command("sync")
    .description("Sync enabled marketplaces into local cache index")
    .option("-c, --config <path>", "openteam config path", "openteam.yaml")
    .option("--cache-dir <path>", "cache dir", ".openteam/cache")
    .action((options) => {
      const cfg = loadOrCreateOpenTeamConfig(options.config);
      const out = syncMarketplaces(cfg, options.cacheDir);
      success(`Synced marketplace index: ${out}`);
    });
}
