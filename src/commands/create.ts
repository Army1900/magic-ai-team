import { Command } from "commander";
import { loadTeamConfig } from "../core/config";
import { resolveTeamFileOrThrow } from "../core/current-team";
import {
  attachGeneratedToTeam,
  generateAgentDraft,
  generateMcpDraft,
  generateSkillDraft,
  saveGeneratedResource
} from "../core/create";
import { error, info, success } from "../core/ui";

export function registerCreateCommand(program: Command): void {
  const cmd = program.command("create").description("Create draft agent/skill/mcp resources");

  cmd
    .command("agent")
    .description("Create an agent draft from a role")
    .requiredOption("--from-role <text>", "role description")
    .option("--model <id>", "primary model", "openai:gpt-5-mini")
    .option("--attach", "append to current team config", false)
    .option("-f, --file <path>", "team config path (overrides --team/current)")
    .option("--team <nameOrSlug>", "team from registry (default: current team)")
    .action((options) => {
      try {
        const draft = generateAgentDraft(options.fromRole, options.model);
        const out = saveGeneratedResource("agent", draft.id, draft);
        success(`Generated agent draft: ${out}`);
        if (options.attach) {
          const teamFile = resolveTeamFileOrThrow({ file: options.file, team: options.team });
          attachGeneratedToTeam("agent", draft, teamFile);
          info(`Attached to ${teamFile}`);
        }
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
        info("Next: run `openteam team use --name <team>` or pass --file/--team.");
        process.exitCode = 1;
      }
    });

  cmd
    .command("skill")
    .description("Create a skill draft from a goal")
    .requiredOption("--from-goal <text>", "goal description")
    .option("--risk-level <level>", "low|medium|high", "medium")
    .option("--trust-score <value>", "0.0 - 1.0", "0.8")
    .option("--auto-comply", "auto-raise trust score to policy minimum when attaching", false)
    .option("--attach", "append to current team config", false)
    .option("-f, --file <path>", "team config path (overrides --team/current)")
    .option("--team <nameOrSlug>", "team from registry (default: current team)")
    .action((options) => {
      try {
        let parsedTrust = Number(options.trustScore);
        if (!Number.isFinite(parsedTrust) || parsedTrust < 0 || parsedTrust > 1) {
          error("Invalid --trust-score. Expected number between 0 and 1.");
          process.exitCode = 1;
          return;
        }
        const risk = String(options.riskLevel).toLowerCase();
        if (!["low", "medium", "high"].includes(risk)) {
          error("Invalid --risk-level. Expected one of: low, medium, high.");
          process.exitCode = 1;
          return;
        }

        let teamFile: string | undefined;
        if (options.attach) {
          teamFile = resolveTeamFileOrThrow({ file: options.file, team: options.team });
          const team = loadTeamConfig(teamFile);
          const minTrust = team.policies.security.min_skill_trust_score;
          if (parsedTrust < minTrust) {
            if (options.autoComply) {
              parsedTrust = minTrust;
              info(`Adjusted trust-score to policy minimum: ${minTrust}`);
            } else {
              info(
                `Policy suggestion: current trust-score=${parsedTrust} is below min_skill_trust_score=${minTrust}. ` +
                  `Use --trust-score ${minTrust} or add --auto-comply.`
              );
            }
          }
        }

        const draft = generateSkillDraft(options.fromGoal, {
          riskLevel: risk,
          trustScore: parsedTrust
        });
        const out = saveGeneratedResource("skill", draft.id, draft);
        success(`Generated skill draft: ${out}`);
        if (options.attach && teamFile) {
          attachGeneratedToTeam("skill", draft, teamFile);
          info(`Attached to ${teamFile}`);
        }
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
        info("Next: run `openteam team use --name <team>` or pass --file/--team.");
        process.exitCode = 1;
      }
    });

  cmd
    .command("mcp")
    .description("Create an MCP draft from an API reference")
    .requiredOption("--from-api <text>", "api name or URL")
    .option("--attach", "append to current team config", false)
    .option("-f, --file <path>", "team config path (overrides --team/current)")
    .option("--team <nameOrSlug>", "team from registry (default: current team)")
    .action((options) => {
      try {
        const draft = generateMcpDraft(options.fromApi);
        const out = saveGeneratedResource("mcp", draft.id, draft);
        success(`Generated mcp draft: ${out}`);
        if (options.attach) {
          const teamFile = resolveTeamFileOrThrow({ file: options.file, team: options.team });
          attachGeneratedToTeam("mcp", draft, teamFile);
          info(`Attached to ${teamFile}`);
        }
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
        info("Next: run `openteam team use --name <team>` or pass --file/--team.");
        process.exitCode = 1;
      }
    });
}
