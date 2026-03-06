import { Command } from "commander";
import { getOpenTeamHome } from "../core/home";
import {
  createTeamInRegistry,
  findRegistryTeam,
  getCurrentTeamEntry,
  listRegistryTeams,
  useRegistryTeam
} from "../core/team-registry";
import { banner, error, info, kv, status, success } from "../core/ui";

export function registerTeamCommand(program: Command): void {
  const cmd = program.command("team").description("Manage teams in OPENTEAM_HOME registry");

  cmd
    .command("create")
    .description("Create team in central registry")
    .requiredOption("--name <name>", "team name")
    .requiredOption("--goal <goal>", "team goal")
    .option("--force", "overwrite existing team", false)
    .action((options) => {
      try {
        const entry = createTeamInRegistry(options.name, options.goal, Boolean(options.force));
        banner("Team Created", entry.name);
        kv("slug", entry.slug);
        kv("team_file", entry.team_file);
        kv("team_dir", entry.team_dir);
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
        process.exitCode = 1;
      }
    });

  cmd
    .command("list")
    .description("List teams in registry")
    .action(() => {
      const registry = listRegistryTeams();
      banner("Team Registry", getOpenTeamHome());
      if (registry.teams.length === 0) {
        info("No teams found.");
        return;
      }
      for (const t of registry.teams) {
        const mark = t.slug === registry.current_team_slug ? "ok" : "warn";
        status(mark, `${t.name} (${t.slug})`, t.team_file);
      }
    });

  cmd
    .command("use")
    .description("Set current team")
    .requiredOption("--name <nameOrSlug>", "team name or slug")
    .action((options) => {
      try {
        const entry = useRegistryTeam(options.name);
        success(`Current team set: ${entry.name} (${entry.slug})`);
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
        process.exitCode = 1;
      }
    });

  cmd
    .command("show")
    .description("Show team details")
    .requiredOption("--name <nameOrSlug>", "team name or slug")
    .action((options) => {
      const entry = findRegistryTeam(options.name);
      if (!entry) {
        error(`Team not found: ${options.name}`);
        process.exitCode = 1;
        return;
      }
      banner("Team", entry.name);
      kv("slug", entry.slug);
      kv("goal", entry.goal);
      kv("team_file", entry.team_file);
      kv("updated_at", entry.updated_at);
    });

  cmd
    .command("current")
    .description("Show current selected team")
    .action(() => {
      const entry = getCurrentTeamEntry();
      if (!entry) {
        info("No current team selected.");
        return;
      }
      banner("Current Team", entry.name);
      kv("slug", entry.slug);
      kv("team_file", entry.team_file);
    });

  cmd
    .command("path")
    .description("Print team file path")
    .requiredOption("--name <nameOrSlug>", "team name or slug")
    .action((options) => {
      const entry = findRegistryTeam(options.name);
      if (!entry) {
        error(`Team not found: ${options.name}`);
        process.exitCode = 1;
        return;
      }
      console.log(entry.team_file);
    });
}
