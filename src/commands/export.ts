import { Command } from "commander";
import { loadTeamConfig } from "../core/config";
import { exportTeam, validateExportResult, writeExportManifest } from "../core/exporters";
import { banner, error, info, kv, status, success } from "../core/ui";
import { evaluatePolicies } from "../core/policy";
import { checkTargetCompatibility } from "../core/compatibility";
import { resolveTeamFileOrThrow } from "../core/current-team";
import { resolveManagementModel } from "../core/management-models";
import { invokeModel } from "../core/model-providers";
import { EXPORT_TARGET_HELP, ExportTarget, normalizeExportTarget } from "../core/targets";
import { assessGateFindings } from "../core/gates";

function resolveTeamFileFromOptions(options: { team?: string; file?: string }): string {
  return resolveTeamFileOrThrow(options);
}

export function registerExportCommand(program: Command): void {
  program
    .command("export")
    .description("Export team config to framework-specific project config")
    .requiredOption("--target <target>", EXPORT_TARGET_HELP)
    .requiredOption("--out <path>", "project output path")
    .option("--team <nameOrSlug>", "team from registry (default: current team)")
    .option("--file <path>", "explicit team.yaml path (overrides --team)")
    .option("--strict", "block export on any warning", false)
    .option("--strict-target", "block export on any target validation warning", false)
    .option("--skip-policy-gate", "skip policy checks before export", false)
    .option("--mapper-model <model>", "override exporter mapper model")
    .option("--mapper-execution-mode <mode>", "mock|live", "mock")
    .option("--json", "json output mode", false)
    .action(async (options) => {
      try {
        const teamFile = resolveTeamFileFromOptions(options);
        const target = normalizeExportTarget(options.target);
        const team = loadTeamConfig(teamFile);

        const strict = Boolean(options.strict);
        const skipPolicyGate = Boolean(options.skipPolicyGate);

        if (!skipPolicyGate) {
          const policy = evaluatePolicies(team);
          const policyGate = assessGateFindings(policy.findings, strict);
          if (policyGate.blocked) {
            if (options.json) {
              console.log(
                JSON.stringify(
                  {
                    success: false,
                    blocked_by: "policy",
                    team_file: teamFile,
                    findings: policy.findings
                  },
                  null,
                  2
                )
              );
              process.exitCode = 1;
              return;
            }
            error("Export blocked by policy gate.");
            for (const finding of policy.findings) {
              status(finding.severity, finding.code, finding.message);
            }
            process.exitCode = 1;
            return;
          }
          for (const finding of policyGate.warns) {
            status("warn", finding.code, finding.message);
          }
        }

        const compatibility = checkTargetCompatibility(team, target);
        const compatGate = assessGateFindings(compatibility.findings, strict);
        if (compatGate.blocked) {
          if (options.json) {
            console.log(
              JSON.stringify(
                {
                  success: false,
                  blocked_by: "compatibility",
                  target,
                  team_file: teamFile,
                  findings: compatibility.findings
                },
                null,
                2
              )
            );
            process.exitCode = 1;
            return;
          }
          error(`Export blocked by ${target} compatibility check.`);
          for (const finding of compatibility.findings) {
            status(finding.severity, finding.code, finding.message);
          }
          process.exitCode = 1;
          return;
        }

        const result = exportTeam(team, target, options.out);
        result.warnings.push(...compatGate.warns.map((w) => `[${w.code}] ${w.message}`));
        const targetValidation = validateExportResult(result);
        const strictTarget = Boolean(options.strictTarget);
        const targetGate = assessGateFindings(targetValidation.findings, strictTarget);
        if (targetGate.blocked) {
          if (options.json) {
            console.log(
              JSON.stringify(
                {
                  success: false,
                  blocked_by: "target_validation",
                  target,
                  team_file: teamFile,
                  findings: targetValidation.findings
                },
                null,
                2
              )
            );
            process.exitCode = 1;
            return;
          }
          error(`Export blocked by ${target} target validation.`);
          for (const finding of targetValidation.findings) {
            status(finding.severity, finding.code, finding.message);
          }
          info(`Next: rerun export without --strict-target, or fix missing target files for ${target}.`);
          process.exitCode = 1;
          return;
        }
        for (const finding of targetGate.warns) {
          status("warn", finding.code, finding.message);
        }

        const mapperModel = resolveManagementModel("exporter_mapper", options.mapperModel);
        const mapperMode = options.mapperExecutionMode === "live" ? "live" : "mock";
        try {
          const mapper = await invokeModel(
            {
              model: mapperModel,
              prompt:
                `You are an export mapper advisor.\n` +
                `Target: ${target}\n` +
                `Summarize top 2 migration notes for this team export in 2 bullet lines.\n` +
                `Team summary:\n${JSON.stringify(
                  {
                    team: team.team,
                    agents: team.execution_plane.agents.map((a) => ({ id: a.id, model: a.model.primary })),
                    skills: team.resources.skills.map((s) => s.id),
                    mcps: team.resources.mcps.map((m) => m.id)
                  },
                  null,
                  2
                )}`
            },
            mapperMode
          );
          if (mapper.text?.trim()) {
            result.warnings.push(`[AI_MAPPER_NOTE model=${mapperModel}] ${mapper.text.trim().slice(0, 300)}`);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          status("warn", "mapper_fallback", `AI exporter mapper unavailable, continue with static adapter (${msg})`);
        }

        const manifest = writeExportManifest(options.out, result, teamFile);

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                team_file: teamFile,
                target,
                result,
                manifest
              },
              null,
              2
            )
          );
          return;
        }

        banner("Export Complete", target);
        kv("team_file", teamFile);
        kv("output_dir", result.output_dir);
        kv("manifest", manifest);
        info("Generated files:");
        for (const file of result.files) {
          info(`- ${file}`);
        }
        if (result.warnings.length > 0) {
          for (const warning of result.warnings) {
            status("warn", "compatibility", warning);
          }
        } else {
          success("No compatibility warnings.");
        }
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
        info("Next: run `openteam validate` and `openteam policy show`, then retry export.");
        process.exitCode = 1;
      }
    });
}
