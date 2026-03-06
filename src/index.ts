#!/usr/bin/env node
import { Command } from "commander";
import { registerInitCommand } from "./commands/init";
import { registerValidateCommand } from "./commands/validate";
import { registerDoctorCommand } from "./commands/doctor";
import { registerRunCommand } from "./commands/run";
import { registerSimulateCommand } from "./commands/simulate";
import { registerEvaluateCommand } from "./commands/evaluate";
import { registerOptimizeCommand } from "./commands/optimize";
import { registerCompareCommand } from "./commands/compare";
import { registerRollbackCommand } from "./commands/rollback";
import { registerMarketplaceCommand } from "./commands/marketplace";
import { registerCreateCommand } from "./commands/create";
import { registerPolicyCommand } from "./commands/policy";
import { registerContextCommand } from "./commands/context";
import { loadOpenTeamConfig } from "./core/config";
import { registerThemeCommand } from "./commands/theme";
import { setupUi } from "./core/ui";
import { registerTeamCommand } from "./commands/team";
import { registerExportCommand } from "./commands/export";
import { registerStatusCommand } from "./commands/status";
import { registerUpCommand } from "./commands/up";
import { registerProviderCommand } from "./commands/provider";
import { registerQuickstartCommand } from "./commands/quickstart";
import { registerMonitorCommand } from "./commands/monitor";
import { registerHandoffCommand } from "./commands/handoff";
import { registerStartCommand } from "./commands/start";
import { registerGoCommand } from "./commands/go";

const program = new Command();

program
  .name("openteam")
  .description("Model-driven Team OS CLI")
  .version("0.1.0")
  .option("--theme <name>", "ui theme (nord|dracula|gruvbox|solarized-dark)")
  .option("--no-color", "disable colored output");

program.hook("preAction", () => {
  const opts = program.opts<{ theme?: string; color?: boolean }>();
  let cfgTheme: string | undefined;
  let cfgColor: boolean | undefined;
  try {
    const cfg = loadOpenTeamConfig("openteam.yaml");
    cfgTheme = cfg.ui?.theme;
    cfgColor = cfg.ui?.color;
  } catch {
    // ignore missing or invalid openteam.yaml and rely on cli/default
  }

  setupUi({
    theme: opts.theme ?? cfgTheme,
    color: opts.color ?? cfgColor ?? true
  });
});

registerInitCommand(program);
registerValidateCommand(program);
registerDoctorCommand(program);
registerRunCommand(program);
registerSimulateCommand(program);
registerEvaluateCommand(program);
registerOptimizeCommand(program);
registerCompareCommand(program);
registerRollbackCommand(program);
registerMarketplaceCommand(program);
registerCreateCommand(program);
registerPolicyCommand(program);
registerContextCommand(program);
registerThemeCommand(program);
registerTeamCommand(program);
registerExportCommand(program);
registerStatusCommand(program);
registerUpCommand(program);
registerProviderCommand(program);
registerQuickstartCommand(program);
registerMonitorCommand(program);
registerHandoffCommand(program);
registerStartCommand(program);
registerGoCommand(program);

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
