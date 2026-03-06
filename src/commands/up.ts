import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createTeamInRegistry, useRegistryTeam } from "../core/team-registry";
import { loadTeamConfig, writeYamlFile } from "../core/config";
import { validateTeamConfig } from "../core/validate";
import { evaluatePolicies } from "../core/policy";
import { executeTask, saveRunArtifact } from "../core/runtime";
import { evaluateRun, saveEvalReport } from "../core/evaluate";
import { checkTargetCompatibility } from "../core/compatibility";
import { banner, error, info, kv, status, success } from "../core/ui";
import { resolveManagementModel } from "../core/management-models";
import { canInvokeLive, invokeModel } from "../core/model-providers";
import { loadMethodologyGuidance } from "../core/methodology";
import { EXPORT_TARGET_HELP, ExportTarget, normalizeExportTarget } from "../core/targets";
import { assessGateFindings } from "../core/gates";

type Target = ExportTarget;
type Priority = "quality" | "speed" | "cost" | "balanced";
type HumanLoop = "low" | "medium" | "high";

interface DiscoveryAnswers {
  teamName: string;
  problem: string;
  outcome: string;
  target: Target;
  priority: Priority;
  constraints: string;
  humanLoop: HumanLoop;
}

type Choice<T extends string> = { key: string; label: string; value: T };
export interface UpCommandOptions {
  name?: string;
  goal?: string;
  target?: string;
  nonInteractive?: boolean;
  task?: string;
  strict?: boolean;
  verbose?: boolean;
}

export interface UpFlowResult {
  ok: boolean;
  team_slug?: string;
  team_file?: string;
  target?: Target;
}

function normalizeTarget(target: string): Target {
  return normalizeExportTarget(target);
}

function normalizePriority(value: string): Priority {
  const v = value.toLowerCase();
  if (v === "quality" || v === "speed" || v === "cost" || v === "balanced") return v;
  return "balanced";
}

function normalizeHumanLoop(value: string): HumanLoop {
  const v = value.toLowerCase();
  if (v === "low" || v === "medium" || v === "high") return v;
  return "medium";
}

async function collectDiscovery(options: {
  name?: string;
  goal?: string;
  target?: string;
  nonInteractive?: boolean;
}): Promise<DiscoveryAnswers> {
  const defaultName = options.name ?? "My Team";
  const defaultProblem = options.goal ?? "Automate support triage";
  const defaultOutcome = options.goal ? "Deliver measurable improvements" : "Reduce manual workload and improve consistency";
  const defaultTarget = normalizeTarget(options.target ?? "claude");
  const defaultPriority: Priority = "balanced";
  const defaultConstraints = "No special constraints";
  const defaultHuman: HumanLoop = "medium";

  if (options.nonInteractive) {
    return {
      teamName: defaultName,
      problem: defaultProblem,
      outcome: defaultOutcome,
      target: defaultTarget,
      priority: defaultPriority,
      constraints: defaultConstraints,
      humanLoop: defaultHuman
    };
  }

  const rl = readline.createInterface({ input, output });
  banner("OpenTeam Guided Setup");
  info("Let's define your team in a few short steps. You can pick by number.");

  async function askChoice<T extends string>(
    question: string,
    choices: Choice<T>[],
    defaultValue: T
  ): Promise<T> {
    const defaultChoice = choices.find((c) => c.value === defaultValue) ?? choices[0];
    info(question);
    for (const c of choices) {
      info(`  ${c.key}) ${c.label}`);
    }
    const answer = (await rl.question(`Select [${defaultChoice?.key}]: `)).trim();
    const selected = choices.find((c) => c.key === answer) ?? defaultChoice;
    return selected.value;
  }

  async function askTemplateText(
    index: string,
    title: string,
    templates: Choice<string>[],
    fallback: string
  ): Promise<string> {
    const selected = await askChoice(`${index}) ${title}`, templates, templates[0].value);
    if (selected !== "__custom__") {
      return selected;
    }
    const custom = (await rl.question(`   Enter custom text [${fallback}]: `)).trim();
    return custom || fallback;
  }

  const teamName = (await rl.question(`1) Team name [${defaultName}]: `)).trim() || defaultName;
  const problem = await askTemplateText(
    "2",
    "Choose the main problem to solve:",
    [
      { key: "1", label: "Automate support triage", value: "Automate support triage" },
      { key: "2", label: "Generate weekly product insights", value: "Generate weekly product insights from customer data" },
      { key: "3", label: "Improve QA and release safety", value: "Improve QA coverage and release safety checks" },
      { key: "4", label: "Custom input", value: "__custom__" }
    ],
    defaultProblem
  );
  const outcome = await askTemplateText(
    "3",
    "Choose the success outcome:",
    [
      { key: "1", label: "Reduce manual work and improve consistency", value: "Reduce manual workload and improve consistency" },
      { key: "2", label: "Shorten response cycle time", value: "Shorten end-to-end response cycle time by 30%" },
      { key: "3", label: "Increase quality and reduce defects", value: "Increase output quality and reduce defects by 25%" },
      { key: "4", label: "Custom input", value: "__custom__" }
    ],
    defaultOutcome
  );
  const target = await askChoice(
    "4) Target framework:",
    [
      { key: "1", label: "Claude", value: "claude" },
      { key: "2", label: "OpenCode", value: "opencode" },
      { key: "3", label: "OpenClaw", value: "openclaw" },
      { key: "4", label: "Codex", value: "codex" },
      { key: "5", label: "Aider", value: "aider" },
      { key: "6", label: "Continue", value: "continue" },
      { key: "7", label: "Cline", value: "cline" },
      { key: "8", label: "OpenHands", value: "openhands" },
      { key: "9", label: "Tabby", value: "tabby" }
    ],
    defaultTarget
  );
  const priority = await askChoice(
    "5) Optimization priority:",
    [
      { key: "1", label: "Balanced (recommended)", value: "balanced" },
      { key: "2", label: "Quality first", value: "quality" },
      { key: "3", label: "Speed first", value: "speed" },
      { key: "4", label: "Cost first", value: "cost" }
    ],
    defaultPriority
  );
  const constraints = await askTemplateText(
    "6",
    "Choose constraints:",
    [
      { key: "1", label: "No special constraints", value: "No special constraints" },
      { key: "2", label: "Strict privacy and compliance", value: "No external data exfiltration; privacy/compliance is strict" },
      { key: "3", label: "Tight budget", value: "Keep average run cost below USD 1.0" },
      { key: "4", label: "Custom input", value: "__custom__" }
    ],
    defaultConstraints
  );
  const humanLoop = await askChoice(
    "7) Human approval level:",
    [
      { key: "1", label: "Medium (recommended)", value: "medium" },
      { key: "2", label: "High (stricter review)", value: "high" },
      { key: "3", label: "Low (faster automation)", value: "low" }
    ],
    defaultHuman
  );
  rl.close();

  return {
    teamName,
    problem,
    outcome,
    target: normalizeTarget(target),
    priority: normalizePriority(priority),
    constraints,
    humanLoop: normalizeHumanLoop(humanLoop)
  };
}

function applyDiscoveryHeuristics(team: ReturnType<typeof loadTeamConfig>, answers: DiscoveryAnswers): void {
  if (answers.priority === "speed" || answers.priority === "cost") {
    for (const agent of team.execution_plane.agents) {
      if (!agent.model.primary.includes("mini")) {
        agent.model.primary = "openai:gpt-5-mini";
      }
    }
  }

  if (answers.priority === "quality") {
    const executor = team.execution_plane.agents.find((a) => a.id === "executor");
    if (executor) {
      executor.model.primary = "openai:gpt-5";
    }
  }

  if (answers.priority === "cost") {
    team.policies.budget.max_cost_usd_per_run = Math.min(team.policies.budget.max_cost_usd_per_run, 1.0);
  }

  if (answers.humanLoop === "high") {
    team.policies.security.require_human_approval_for_prod = true;
  }
  if (answers.humanLoop === "low") {
    team.policies.security.require_human_approval_for_prod = false;
  }
}

export async function runUpFlow(options: UpCommandOptions): Promise<UpFlowResult> {
  try {
    const verbose = Boolean(options.verbose);
    const vkv = (key: string, value: string | number | boolean): void => {
      if (verbose) kv(key, value);
    };
    const vstatus = (kind: "ok" | "warn" | "fail", label: string, detail: string): void => {
      if (verbose) status(kind, label, detail);
    };

    const discovery = await collectDiscovery({
      name: options.name,
      goal: options.goal,
      target: options.target,
      nonInteractive: Boolean(options.nonInteractive)
    });

    const target = discovery.target;
    const goal = `${discovery.problem}. Success outcome: ${discovery.outcome}. Constraints: ${discovery.constraints}.`;
    const entry = createTeamInRegistry(discovery.teamName, goal, true);
    useRegistryTeam(entry.slug);
    const plannerModel = resolveManagementModel("planner");
    const plannerExecMode = canInvokeLive(plannerModel) ? "live" : "mock";

    banner("OpenTeam Up", entry.name);
    kv("team_slug", entry.slug);
    kv("target", target);
    vkv("team_file", entry.team_file);
    vkv("planner_model", plannerModel);
    vkv("planner_mode", plannerExecMode);
    vkv("priority", discovery.priority);
    vkv("human_loop", discovery.humanLoop);

    const team = loadTeamConfig(entry.team_file);
    const plannerAgent = team.control_plane.manager_agents.find((a) => a.type === "planner" || a.id === "planner");
    if (plannerAgent) {
      plannerAgent.model = plannerModel;
    }
    applyDiscoveryHeuristics(team, discovery);
    writeYamlFile(entry.team_file, team);

    const methodology = loadMethodologyGuidance();
    let planningNote =
      `Planner mode=rule.\n` +
      `Problem: ${discovery.problem}\n` +
      `Outcome: ${discovery.outcome}\n` +
      `Constraints: ${discovery.constraints}\n` +
      `Priority: ${discovery.priority}\n` +
      `Human loop: ${discovery.humanLoop}\n`;
    try {
      const aiPlan = await invokeModel(
        {
          model: plannerModel,
          prompt:
            `You are an OpenTeam planner.\n` +
            `Follow this methodology strictly:\n${methodology}\n\n` +
            `Discovery:\n${JSON.stringify(discovery, null, 2)}\n\n` +
            `Generate markdown with sections:\n` +
            `- Team Topology\n- Agent Responsibilities\n- Skill/MCP Selection\n- Risks & Guardrails\n- First 3 Actions`
        },
        plannerExecMode
      );
      planningNote = aiPlan.text || planningNote;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      status("warn", "planner_fallback", `AI planning unavailable, fallback to rule mode (${msg})`);
    }
    const notePath = path.join(entry.team_dir, "planning-note.md");
    const discoveryPath = path.join(entry.team_dir, "discovery-summary.md");
    fs.writeFileSync(
      notePath,
      `# Planning Note\n\n` +
        `- planner_model: ${plannerModel}\n` +
        `- planner_execution_mode: ${plannerExecMode}\n\n` +
        `${planningNote}\n`,
      "utf8"
    );
    fs.writeFileSync(
      discoveryPath,
      `# Discovery Summary\n\n` +
        `- team_name: ${discovery.teamName}\n` +
        `- problem: ${discovery.problem}\n` +
        `- outcome: ${discovery.outcome}\n` +
        `- target: ${discovery.target}\n` +
        `- priority: ${discovery.priority}\n` +
        `- constraints: ${discovery.constraints}\n` +
        `- human_loop: ${discovery.humanLoop}\n`,
      "utf8"
    );
    vkv("discovery_note", discoveryPath);
    vkv("planning_note", notePath);

    const validation = validateTeamConfig(team);
    if (!validation.valid) {
      error("Schema validation failed.");
      for (const e of validation.errors) {
        status("fail", "schema", e);
      }
      return { ok: false };
    }
    success("Schema validation passed.");

    const strict = Boolean(options.strict);
    const policy = evaluatePolicies(team);
    const policyGate = assessGateFindings(policy.findings, strict);
    if (verbose) {
      for (const finding of policy.findings) {
        status(finding.severity, finding.code, finding.message);
      }
    } else {
      for (const finding of policyGate.fails) {
        status("fail", finding.code, finding.message);
      }
      if (policyGate.warns.length > 0) {
        vstatus("warn", "policy", `warnings=${policyGate.warns.length}`);
      }
    }
    if (policyGate.blocked) {
      error("Blocked by policy gate.");
      info("Next: openteam policy show");
      return { ok: false };
    }

    const run = executeTask(team, options.task ?? "Draft an initial delivery plan", "simulate");
    const runPath = saveRunArtifact(run, team.observability.store.runs_dir);
    vkv("simulated_run", run.run_id);
    vkv("run_saved", runPath);

    const report = evaluateRun(team, run);
    const reportPath = saveEvalReport(report, team.observability.store.reports_dir);
    kv("eval_score", report.summary.overall_score);
    vkv("report_saved", reportPath);

    const compatibility = checkTargetCompatibility(team, target);
    const compatGate = assessGateFindings(compatibility.findings, strict);
    if (verbose) {
      for (const finding of compatibility.findings) {
        status(finding.severity, finding.code, finding.message);
      }
    } else {
      for (const finding of compatGate.fails) {
        status("fail", finding.code, finding.message);
      }
      if (compatGate.warns.length > 0) {
        status("warn", "compatibility", `${compatGate.warns.length} warnings (use --verbose to inspect)`);
      }
    }
    if (compatGate.blocked) {
      error("Blocked by compatibility gate.");
      info(`Next: choose another target or run: openteam export --team ${entry.slug} --target <target> --out <project-path>`);
      return { ok: false };
    }

    success("Up flow completed.");
    info(`Next: openteam export --team ${entry.slug} --target ${target} --out <project-path>`);
    info("After export, worklog will be created at <project>/.openteam/worklog and can be monitored via `openteam monitor ...`.");
    return { ok: true, team_slug: entry.slug, team_file: entry.team_file, target };
  } catch (e) {
    error(e instanceof Error ? e.message : String(e));
    info("Next: run `openteam team list` or `openteam up --non-interactive` to recover quickly.");
    return { ok: false };
  }
}

export function registerUpCommand(program: Command): void {
  program
    .command("up")
    .description("Guided bootstrap flow: requirement dialog -> team setup -> validate -> policy -> simulate -> evaluate")
    .option("--name <name>", "team name")
    .option("--goal <goal>", "team goal")
    .option("--target <target>", EXPORT_TARGET_HELP)
    .option("--non-interactive", "use defaults/arguments without guided questions", false)
    .option("--task <text>", "sample task", "Draft an initial delivery plan")
    .option("--strict", "block on warnings in policy/compatibility", false)
    .option("--verbose", "show detailed setup output", false)
    .action(async (options) => {
      const result = await runUpFlow(options);
      if (!result.ok) {
        process.exitCode = 1;
      }
    });
}
