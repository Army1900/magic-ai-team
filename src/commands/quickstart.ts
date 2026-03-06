import { Command } from "commander";
import { loadTeamConfig } from "../core/config";
import { checkTargetCompatibility } from "../core/compatibility";
import { exportTeam, ExportTarget, writeExportManifest } from "../core/exporters";
import { evaluatePolicies } from "../core/policy";
import { banner, error, info, kv, status, success } from "../core/ui";
import { runUpFlow } from "./up";

function normalizeTarget(target: string): ExportTarget {
  const lowered = target.toLowerCase();
  if (
    lowered === "opencode" ||
    lowered === "openclaw" ||
    lowered === "claude" ||
    lowered === "codex" ||
    lowered === "aider" ||
    lowered === "continue" ||
    lowered === "cline" ||
    lowered === "openhands" ||
    lowered === "tabby"
  ) {
    return lowered;
  }
  throw new Error(
    "Unsupported target. Use one of: opencode, openclaw, claude, codex, aider, continue, cline, openhands, tabby"
  );
}

export function registerQuickstartCommand(program: Command): void {
  program
    .command("quickstart")
    .description("Beginner one-command flow: guided setup + optional export")
    .option("--name <name>", "team name")
    .option("--goal <goal>", "team goal")
    .option("--target <target>", "opencode|openclaw|claude|codex|aider|continue|cline|openhands|tabby", "claude")
    .option("--out <path>", "project path for auto export")
    .option("--non-interactive", "use defaults/arguments without guided questions", false)
    .option("--task <text>", "sample task", "Draft an initial delivery plan")
    .option("--strict", "block on warnings in policy/compatibility", false)
    .option("--verbose", "show detailed setup/export output", false)
    .action(async (options) => {
      const upResult = await runUpFlow(options);
      if (!upResult.ok || !upResult.team_file || !upResult.team_slug) {
        process.exitCode = 1;
        return;
      }

      if (!options.out) {
        info("Quickstart setup finished.");
        info(`Next: openteam export --team ${upResult.team_slug} --target ${upResult.target ?? "claude"} --out <project-path>`);
        info("After export, worklog will be created at <project>/.openteam/worklog and can be monitored via `openteam monitor ...`.");
        return;
      }

      try {
        const target = normalizeTarget(options.target ?? upResult.target ?? "claude");
        const strict = Boolean(options.strict);
        const team = loadTeamConfig(upResult.team_file);

        const policy = evaluatePolicies(team);
        const policyFails = policy.findings.filter((f) => f.severity === "fail");
        const policyWarns = policy.findings.filter((f) => f.severity === "warn");
        if (policyFails.length > 0 || (strict && policyWarns.length > 0)) {
          error("Quickstart export blocked by policy gate.");
          for (const finding of policy.findings) {
            status(finding.severity, finding.code, finding.message);
          }
          info("Next: openteam policy show");
          process.exitCode = 1;
          return;
        }

        const compatibility = checkTargetCompatibility(team, target);
        const compatFails = compatibility.findings.filter((f) => f.severity === "fail");
        const compatWarns = compatibility.findings.filter((f) => f.severity === "warn");
        if (compatFails.length > 0 || (strict && compatWarns.length > 0)) {
          error("Quickstart export blocked by compatibility gate.");
          for (const finding of compatibility.findings) {
            status(finding.severity, finding.code, finding.message);
          }
          info(
            "Next: try another target with `--target opencode|openclaw|claude|codex|aider|continue|cline|openhands|tabby`."
          );
          process.exitCode = 1;
          return;
        }

        const result = exportTeam(team, target, options.out);
        result.warnings.push(...compatWarns.map((w) => `[${w.code}] ${w.message}`));
        const manifest = writeExportManifest(options.out, result, upResult.team_file);
        const verbose = Boolean(options.verbose);

        banner("Quickstart Export Complete", target);
        kv("team_slug", upResult.team_slug);
        kv("output_dir", result.output_dir);
        if (verbose) {
          kv("manifest", manifest);
          for (const file of result.files) {
            info(`- ${file}`);
          }
        }
        if (result.warnings.length > 0) {
          if (verbose) {
            for (const warning of result.warnings) {
              status("warn", "export", warning);
            }
          } else {
            status("warn", "export", `${result.warnings.length} warnings (use --verbose to inspect)`);
          }
        } else {
          success("No export warnings.");
        }
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
        info("Next: run `openteam export --target <target> --out <project-path>` manually.");
        process.exitCode = 1;
      }
    });
}
