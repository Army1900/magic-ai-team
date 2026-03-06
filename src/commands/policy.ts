import { Command } from "commander";
import { loadTeamConfig } from "../core/config";
import { evaluatePolicies } from "../core/policy";
import { banner, info, status, success } from "../core/ui";
import { resolveTeamFileOrThrow } from "../core/current-team";

export function registerPolicyCommand(program: Command): void {
  const cmd = program.command("policy").description("Inspect and enforce team policies");

  cmd
    .command("show")
    .description("Show effective policy settings")
    .option("-f, --file <path>", "team config path (default: current team)")
    .option("--team <nameOrSlug>", "team from registry (default: current team)")
    .option("--json", "json output mode", false)
    .action((options) => {
      const teamFile = resolveTeamFileOrThrow({ file: options.file, team: options.team });
      const team = loadTeamConfig(teamFile);
      if (options.json) {
        console.log(JSON.stringify({ team_file: teamFile, policies: team.policies }, null, 2));
        return;
      }
      banner("Policy", "Effective settings");
      info(JSON.stringify(team.policies, null, 2));
    });

  cmd
    .command("enforce")
    .description("Enforce policy checks for agent/skill/mcp risk")
    .option("-f, --file <path>", "team config path (default: current team)")
    .option("--team <nameOrSlug>", "team from registry (default: current team)")
    .option("--strict", "treat warnings as failures", false)
    .option("--json", "json output mode", false)
    .action((options) => {
      const teamFile = resolveTeamFileOrThrow({ file: options.file, team: options.team });
      const team = loadTeamConfig(teamFile);
      const result = evaluatePolicies(team);
      const strict = Boolean(options.strict);

      if (options.json) {
        const hasFail = result.findings.some((f) => f.severity === "fail");
        const hasWarn = result.findings.some((f) => f.severity === "warn");
        console.log(
          JSON.stringify(
            {
              team_file: teamFile,
              pass: result.pass,
              findings: result.findings
            },
            null,
            2
          )
        );
        if (hasFail || (strict && hasWarn)) {
          process.exitCode = 1;
        }
        return;
      }

      if (result.findings.length === 0) {
        success("Policy checks passed with no findings.");
        return;
      }

      for (const finding of result.findings) {
        status(finding.severity, finding.code, finding.message);
      }

      const hasFail = result.findings.some((f) => f.severity === "fail");
      const hasWarn = result.findings.some((f) => f.severity === "warn");
      if (hasFail || (strict && hasWarn)) {
        process.exitCode = 1;
      }
    });
}
