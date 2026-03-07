import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createTeamInRegistry, useRegistryTeam } from "../core/team-registry";
import { loadTeamConfig, resolveHomeOpenTeamConfigPath, writeYamlFile } from "../core/config";
import { validateTeamConfig } from "../core/validate";
import { evaluatePolicies } from "../core/policy";
import { executeTask, saveRunArtifact } from "../core/runtime";
import { evaluateRun, saveEvalReport } from "../core/evaluate";
import { checkTargetCompatibility } from "../core/compatibility";
import { banner, error, info, kv, status, success } from "../core/ui";
import { resolveManagementModel } from "../core/management-models";
import { canInvokeLive, describeProviderAuth, invokeModel, testProviderConnectivity } from "../core/model-providers";
import { loadMethodologyGuidance } from "../core/methodology";
import { EXPORT_TARGET_HELP, ExportTarget, normalizeExportTarget } from "../core/targets";
import { assessGateFindings } from "../core/gates";
import { loadOrCreateOpenTeamConfig } from "../core/marketplace";
import {
  attachRecommendedResources,
  MarketplaceCandidate,
  recommendMarketplaceCandidates
} from "../core/resource-recommendation";
import { buildRuleBasedTopology, parseAiTopology, TopologyDesign } from "../core/dynamic-topology";

type Target = ExportTarget;
type Priority = "quality" | "speed" | "cost" | "balanced";
type HumanLoop = "low" | "medium" | "high";
type InteractionLocale = "en" | "zh";

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
  force?: boolean;
  allowMock?: boolean;
  aiTurns?: number;
  nonInteractive?: boolean;
  task?: string;
  strict?: boolean;
  verbose?: boolean;
  silent?: boolean;
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

function hasCjkText(input: string): boolean {
  return /[\u3400-\u9FFF]/.test(input);
}

function resolveInteractionLocale(seed?: string): InteractionLocale {
  if (seed && hasCjkText(seed)) return "zh";
  const lang = (process.env.LANG ?? process.env.LC_ALL ?? process.env.LANGUAGE ?? "").toLowerCase();
  if (lang.startsWith("zh")) return "zh";
  return "en";
}

function say(locale: InteractionLocale, en: string, zh: string): string {
  return locale === "zh" ? zh : en;
}

function choiceLabel(locale: InteractionLocale, en: string, zh: string): string {
  return locale === "zh" ? zh : en;
}

async function confirmContinueMock(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  const answer = (await rl.question(`${message} [y/N]: `)).trim().toLowerCase();
  rl.close();
  return answer === "y" || answer === "yes";
}

function parseSelectionInput(inputRaw: string, max: number): number[] {
  const input = (inputRaw ?? "").trim().toLowerCase();
  if (!input) return [];
  if (input === "a" || input === "all") {
    return Array.from({ length: max }, (_, i) => i + 1);
  }
  const tokens = input.split(/[,\s]+/g).filter(Boolean);
  const selected: number[] = [];
  for (const t of tokens) {
    const n = Number(t);
    if (!Number.isInteger(n) || n < 1 || n > max) {
      continue;
    }
    if (!selected.includes(n)) {
      selected.push(n);
    }
  }
  return selected;
}

async function promptMarketplaceSelection(
  locale: InteractionLocale,
  candidates: MarketplaceCandidate[]
): Promise<MarketplaceCandidate[]> {
  if (candidates.length === 0) return [];
  info(say(locale, "Marketplace recommendations based on discovery:", "基于访谈结果的市场推荐资源："));
  for (let i = 0; i < candidates.length; i += 1) {
    const c = candidates[i];
    const typeLabel = c.type === "skill" ? "skill" : "mcp";
    const trust = c.type === "skill" ? ` trust=${c.trust_score ?? 0}` : "";
    info(
      `  ${i + 1}) [${typeLabel}] ${c.id} (${c.source}) risk=${c.risk_level ?? "low"}${trust} - ${c.title}`
    );
  }

  const rl = readline.createInterface({ input, output });
  const answer = (
    await rl.question(
      `${say(locale, "Select items to attach (e.g. 1,3; 'a' for all; Enter to skip)", "选择要挂载的项（如 1,3；输入 a 表示全选；直接回车跳过")}: `
    )
  ).trim();
  rl.close();

  const selectedIndexes = parseSelectionInput(answer, candidates.length);
  return selectedIndexes.map((idx) => candidates[idx - 1]).filter(Boolean);
}

function uniqueStrings(items: string[]): string[] {
  const set = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (!item || set.has(item)) continue;
    set.add(item);
    out.push(item);
  }
  return out;
}

function renderAgentDoc(agent: ReturnType<typeof loadTeamConfig>["execution_plane"]["agents"][number], leadId: string, links: TopologyDesign["links"]): string {
  const inbound = links.filter((l) => l.to === agent.id);
  const outbound = links.filter((l) => l.from === agent.id);
  return (
    `# Agent: ${agent.id}\n\n` +
    `- role: ${agent.role}\n` +
    `- lead: ${agent.id === leadId ? "yes" : "no"}\n` +
    `- model.primary: ${agent.model.primary}\n` +
    `- model.fallback: ${(agent.model.fallback ?? []).join(", ") || "none"}\n` +
    `- input_contract: ${agent.input_contract}\n` +
    `- output_contract: ${agent.output_contract}\n` +
    `- skills: ${agent.skills.join(", ") || "none"}\n` +
    `- mcps: ${agent.mcps.join(", ") || "none"}\n\n` +
    `## Collaboration Inbound\n` +
    `${inbound.length === 0 ? "- none\n" : inbound.map((l) => `- from ${l.from}: trigger=${l.trigger}, output=${l.output}`).join("\n") + "\n"}\n` +
    `## Collaboration Outbound\n` +
    `${outbound.length === 0 ? "- none\n" : outbound.map((l) => `- to ${l.to}: trigger=${l.trigger}, output=${l.output}`).join("\n") + "\n"}`
  );
}

function writeTopologyDocs(
  teamDir: string,
  team: ReturnType<typeof loadTeamConfig>,
  topology: TopologyDesign
): string[] {
  const docsDir = path.join(teamDir, "docs", "agents");
  fs.mkdirSync(docsDir, { recursive: true });
  const docPaths: string[] = [];

  for (const agent of team.execution_plane.agents) {
    const p = path.join(docsDir, `${agent.id}.md`);
    fs.writeFileSync(p, renderAgentDoc(agent, topology.lead_id, topology.links), "utf8");
    docPaths.push(p);
  }

  const graphPath = path.join(docsDir, "team-collaboration.md");
  const graphBody =
    `# Team Collaboration\n\n` +
    `- lead_id: ${topology.lead_id}\n` +
    `- source: ${topology.source}\n` +
    `- rationale: ${topology.rationale}\n\n` +
    `## Handoffs\n` +
    `${topology.links.length === 0 ? "- none\n" : topology.links.map((l, i) => `${i + 1}. ${l.from} -> ${l.to} | trigger: ${l.trigger} | output: ${l.output}`).join("\n") + "\n"}`;
  fs.writeFileSync(graphPath, graphBody, "utf8");
  docPaths.push(graphPath);
  return docPaths;
}

function parseAiRefinedDiscovery(input: string, fallback: DiscoveryAnswers): DiscoveryAnswers {
  try {
    const payload = JSON.parse(input) as Partial<DiscoveryAnswers>;
    return {
      teamName: String(payload.teamName ?? fallback.teamName),
      problem: String(payload.problem ?? fallback.problem),
      outcome: String(payload.outcome ?? fallback.outcome),
      target: normalizeTarget(String(payload.target ?? fallback.target)),
      priority: normalizePriority(String(payload.priority ?? fallback.priority)),
      constraints: String(payload.constraints ?? fallback.constraints),
      humanLoop: normalizeHumanLoop(String(payload.humanLoop ?? fallback.humanLoop))
    };
  } catch {
    return fallback;
  }
}

function parseJsonFromText<T>(text: string, fallback: T): T {
  const raw = (text ?? "").trim();
  try {
    return JSON.parse(raw) as T;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

async function runAiDiscoveryInterview(options: {
  plannerModel: string;
  initialPrompt: string;
  aiTurns: number;
  defaults: DiscoveryAnswers;
  silent: boolean;
}): Promise<DiscoveryAnswers> {
  const { plannerModel, initialPrompt, aiTurns, defaults, silent } = options;
  const transcript: Array<{ role: "user" | "assistant"; text: string }> = [
    { role: "user", text: initialPrompt }
  ];
  let draft = defaults;

  for (let i = 0; i < aiTurns; i += 1) {
    const step = await invokeModel(
      {
        model: plannerModel,
        prompt:
          `You are onboarding a user into a team-configuration workflow.\n` +
          `Infer user language from transcript and continue in that language.\n` +
          `Follow policy: clarify goal -> outcome -> target -> constraints -> human-loop.\n` +
          `Return JSON only: {"done":boolean,"question":string,"draft":{"teamName":string,"problem":string,"outcome":string,"target":string,"priority":string,"constraints":string,"humanLoop":string}}\n\n` +
          `Current draft:\n${JSON.stringify(draft, null, 2)}\n\n` +
          `Transcript:\n${transcript.map((t) => `${t.role}: ${t.text}`).join("\n")}`
      },
      "live"
    );
    const parsed = parseJsonFromText<{ done?: boolean; question?: string; draft?: Partial<DiscoveryAnswers> }>(step.text, {});
    draft = parseAiRefinedDiscovery(JSON.stringify(parsed.draft ?? {}), draft);
    if (parsed.done) break;

    const question = (parsed.question ?? "").trim();
    if (!question) break;
    if (!silent) info(question);

    const rl = readline.createInterface({ input, output });
    const answer = (await rl.question(">> ")).trim();
    rl.close();
    if (!answer) continue;

    transcript.push({ role: "assistant", text: question });
    transcript.push({ role: "user", text: answer });
  }

  const final = await invokeModel(
    {
      model: plannerModel,
      prompt:
        `Finalize discovery into strict JSON with keys: teamName, problem, outcome, target, priority, constraints, humanLoop.\n` +
        `Infer user language from transcript but return keys in English.\n\n` +
        `Draft:\n${JSON.stringify(draft, null, 2)}\n\n` +
        `Transcript:\n${transcript.map((t) => `${t.role}: ${t.text}`).join("\n")}`
    },
    "live"
  );
  return parseAiRefinedDiscovery(final.text, draft);
}

async function collectDiscovery(options: {
  name?: string;
  goal?: string;
  target?: string;
  nonInteractive?: boolean;
  locale?: InteractionLocale;
  plannerModel: string;
  plannerExecMode: "live" | "mock";
  aiTurns: number;
  silent: boolean;
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

  if (options.plannerExecMode === "live") {
    const rl = readline.createInterface({ input, output });
    const initial = (await rl.question("Describe your project/team need in one sentence: ")).trim();
    rl.close();
    return runAiDiscoveryInterview({
      plannerModel: options.plannerModel,
      initialPrompt: initial || defaultProblem,
      aiTurns: Math.max(1, options.aiTurns),
      defaults: {
        teamName: defaultName,
        problem: defaultProblem,
        outcome: defaultOutcome,
        target: defaultTarget,
        priority: defaultPriority,
        constraints: defaultConstraints,
        humanLoop: defaultHuman
      },
      silent: options.silent
    });
  }

  let locale = options.locale ?? resolveInteractionLocale(options.name ?? options.goal);
  const rl = readline.createInterface({ input, output });
  banner(say(locale, "OpenTeam Guided Setup", "OpenTeam 引导设置"));
  info(say(locale, "Let's define your team in a few short steps. You can pick by number.", "我们用几个步骤完成团队配置，你可以输入序号选择。"));

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
    while (true) {
      const answer = (await rl.question(`${say(locale, "Select", "选择")} [${defaultChoice?.key}]: `)).trim();
      if (!answer) {
        return defaultChoice.value;
      }
      const selected = choices.find((c) => c.key === answer);
      if (selected) {
        return selected.value;
      }
      info(say(locale, "Invalid choice. Enter one of the listed numbers.", "输入无效，请输入列表中的数字序号。"));
    }
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
    const custom = (await rl.question(`   ${say(locale, "Enter custom text", "输入自定义内容")} [${fallback}]: `)).trim();
    return custom || fallback;
  }

  const teamName = (await rl.question(`1) ${say(locale, "Team name", "团队名称")} [${defaultName}]: `)).trim() || defaultName;
  if (hasCjkText(teamName)) {
    locale = "zh";
  }
  const problem = await askTemplateText(
    "2",
    say(locale, "Choose the main problem to solve:", "选择主要问题:"),
    [
      { key: "1", label: choiceLabel(locale, "Automate support triage", "自动化客服分流"), value: "Automate support triage" },
      { key: "2", label: choiceLabel(locale, "Generate weekly product insights", "生成每周产品洞察"), value: "Generate weekly product insights from customer data" },
      { key: "3", label: choiceLabel(locale, "Improve QA and release safety", "提升测试质量与发布安全"), value: "Improve QA coverage and release safety checks" },
      { key: "4", label: choiceLabel(locale, "Custom input", "自定义输入"), value: "__custom__" }
    ],
    defaultProblem
  );
  const outcome = await askTemplateText(
    "3",
    say(locale, "Choose the success outcome:", "选择成功结果:"),
    [
      { key: "1", label: choiceLabel(locale, "Reduce manual work and improve consistency", "减少人工工作并提升一致性"), value: "Reduce manual workload and improve consistency" },
      { key: "2", label: choiceLabel(locale, "Shorten response cycle time", "缩短响应周期"), value: "Shorten end-to-end response cycle time by 30%" },
      { key: "3", label: choiceLabel(locale, "Increase quality and reduce defects", "提升质量并降低缺陷"), value: "Increase output quality and reduce defects by 25%" },
      { key: "4", label: choiceLabel(locale, "Custom input", "自定义输入"), value: "__custom__" }
    ],
    defaultOutcome
  );
  const target = await askChoice(
    `4) ${say(locale, "Target framework:", "目标框架:")}`,
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
    `5) ${say(locale, "Optimization priority:", "优化优先级:")}`,
    [
      { key: "1", label: choiceLabel(locale, "Balanced (recommended)", "均衡（推荐）"), value: "balanced" },
      { key: "2", label: choiceLabel(locale, "Quality first", "质量优先"), value: "quality" },
      { key: "3", label: choiceLabel(locale, "Speed first", "速度优先"), value: "speed" },
      { key: "4", label: choiceLabel(locale, "Cost first", "成本优先"), value: "cost" }
    ],
    defaultPriority
  );
  const constraints = await askTemplateText(
    "6",
    say(locale, "Choose constraints:", "选择约束条件:"),
    [
      { key: "1", label: choiceLabel(locale, "No special constraints", "无特殊约束"), value: "No special constraints" },
      { key: "2", label: choiceLabel(locale, "Strict privacy and compliance", "严格隐私与合规"), value: "No external data exfiltration; privacy/compliance is strict" },
      { key: "3", label: choiceLabel(locale, "Tight budget", "预算严格"), value: "Keep average run cost below USD 1.0" },
      { key: "4", label: choiceLabel(locale, "Custom input", "自定义输入"), value: "__custom__" }
    ],
    defaultConstraints
  );
  const humanLoop = await askChoice(
    `7) ${say(locale, "Human approval level:", "人工审批级别:")}`,
    [
      { key: "1", label: choiceLabel(locale, "Medium (recommended)", "中（推荐）"), value: "medium" },
      { key: "2", label: choiceLabel(locale, "High (stricter review)", "高（更严格审核）"), value: "high" },
      { key: "3", label: choiceLabel(locale, "Low (faster automation)", "低（更快自动化）"), value: "low" }
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

interface UpOutput {
  banner: (title: string, subtitle?: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
  kv: (key: string, value: string | number | boolean) => void;
  status: (kind: "ok" | "warn" | "fail", label: string, detail: string) => void;
  success: (msg: string) => void;
  vkv: (key: string, value: string | number | boolean) => void;
  vstatus: (kind: "ok" | "warn" | "fail", label: string, detail: string) => void;
}

function createUpOutput(silent: boolean, verbose: boolean): UpOutput {
  return {
    banner: (title, subtitle) => {
      if (!silent) banner(title, subtitle);
    },
    error: (msg) => {
      if (!silent) error(msg);
    },
    info: (msg) => {
      if (!silent) info(msg);
    },
    kv: (key, value) => {
      if (!silent) kv(key, value);
    },
    status: (kind, label, detail) => {
      if (!silent) status(kind, label, detail);
    },
    success: (msg) => {
      if (!silent) success(msg);
    },
    vkv: (key, value) => {
      if (verbose && !silent) kv(key, value);
    },
    vstatus: (kind, label, detail) => {
      if (verbose && !silent) status(kind, label, detail);
    }
  };
}

async function runAiPrecheck(options: UpCommandOptions, locale: InteractionLocale, out: UpOutput): Promise<{
  ok: boolean;
  plannerModel: string;
  plannerExecMode: "live" | "mock";
}> {
  // Centralized AI readiness gate: auth + provider connectivity before any interactive planning.
  const plannerModel = resolveManagementModel("planner");
  const plannerProvider = (plannerModel.split(":")[0] ?? "").toLowerCase();
  const plannerAuth = describeProviderAuth(plannerModel);
  out.info(
    say(
      locale,
      `AI precheck: model=${plannerModel}, provider=${plannerProvider || "unknown"}`,
      `AI 预检: model=${plannerModel}, provider=${plannerProvider || "unknown"}`
    )
  );

  if (!plannerAuth.ok) {
    const configPath = resolveHomeOpenTeamConfigPath();
    const providerEnvHint = plannerAuth.detail.split(" ")[0] || "OPENAI_API_KEY";
    out.status("warn", "ai_precheck", say(locale, "AI credentials are not available. Live planning cannot run.", "未检测到可用 AI 凭据，无法进行实时模型规划。"));
    out.info(say(locale, "Configure provider auth and retry (recommended):", "请先配置认证后再重试（推荐）："));
    out.info(say(locale, `  - Config file: ${configPath}`, `  - 配置文件: ${configPath}`));
    out.info(say(locale, `  - Set key: PowerShell -> $env:${providerEnvHint}=\"<your-key>\"`, `  - 设置密钥: PowerShell -> $env:${providerEnvHint}=\"<your-key>\"`));
    out.info(say(locale, `  - Verify: openteam provider test --provider ${plannerAuth.provider}`, `  - 验证连通: openteam provider test --provider ${plannerAuth.provider}`));
    if (!Boolean(options.allowMock)) {
      out.error(say(locale, "AI is required for `openteam up`. If you still want offline fallback, add `--allow-mock`.", "`openteam up` 默认需要可用 AI。若你仍需离线兜底，请显式加 `--allow-mock`。"));
      return { ok: false, plannerModel, plannerExecMode: "mock" };
    }
    if (!Boolean(options.nonInteractive) && !Boolean(options.silent)) {
      const keepGoing = await confirmContinueMock(say(locale, "Continue in mock mode?", "继续以 mock 模式执行?"));
      if (!keepGoing) {
        out.info(say(locale, "Cancelled. Configure AI first, then rerun.", "已取消。请先完成 AI 配置后再次运行。"));
        return { ok: false, plannerModel, plannerExecMode: "mock" };
      }
    }
  }

  if (plannerAuth.ok && (plannerProvider === "openai" || plannerProvider === "anthropic")) {
    out.info(
      say(
        locale,
        `AI precheck: testing provider connectivity (${plannerProvider}) ...`,
        `AI 预检: 正在测试提供方连通性 (${plannerProvider}) ...`
      )
    );
    const connectivity = await testProviderConnectivity(plannerProvider, 6000);
    if (!connectivity.ok) {
      out.status("warn", "ai_connectivity", connectivity.detail);
      out.info(say(locale, `Provider endpoint: ${connectivity.endpoint}`, `Provider 端点: ${connectivity.endpoint}`));
      out.info(say(locale, "Check API key/env var, base_url, and network egress/proxy settings.", "请检查 API key/环境变量、base_url，以及网络出口/代理设置。"));
      if (!Boolean(options.allowMock)) {
        out.error(say(locale, "AI provider connectivity check failed. Please fix provider connectivity, or run with --allow-mock for offline fallback.", "AI 提供方连通性检查失败。请先修复网络/配置，或使用 --allow-mock 显式离线兜底。"));
        return { ok: false, plannerModel, plannerExecMode: "mock" };
      }
      out.status("warn", "ai_mode", say(locale, "continue with mock because --allow-mock is enabled", "因启用 --allow-mock，继续以 mock 模式执行"));
    } else {
      out.status("ok", "ai_connectivity", say(locale, `provider reachable: HTTP ${connectivity.status_code ?? 200}`, `提供方可达: HTTP ${connectivity.status_code ?? 200}`));
    }
  }

  return {
    ok: true,
    plannerModel,
    plannerExecMode: canInvokeLive(plannerModel) ? "live" : "mock"
  };
}

async function applyResourceAndTopology(options: {
  entryDir: string;
  team: ReturnType<typeof loadTeamConfig>;
  discovery: DiscoveryAnswers;
  locale: InteractionLocale;
  plannerModel: string;
  plannerExecMode: "live" | "mock";
  nonInteractive: boolean;
  silent: boolean;
  out: UpOutput;
}): Promise<void> {
  // Keep marketplace recommendation and topology composition in one stage to avoid partial state writes.
  const { entryDir, team, discovery, locale, plannerModel, plannerExecMode, nonInteractive, silent, out } = options;
  try {
    const openTeamConfig = loadOrCreateOpenTeamConfig();
    const candidates = recommendMarketplaceCandidates(
      {
        teamName: discovery.teamName,
        problem: discovery.problem,
        outcome: discovery.outcome,
        constraints: discovery.constraints
      },
      team,
      openTeamConfig,
      { skills: 3, mcps: 3 }
    );
    if (candidates.length > 0 && !nonInteractive && !silent) {
      const selected = await promptMarketplaceSelection(locale, candidates);
      if (selected.length > 0) {
        const attached = attachRecommendedResources(team, selected);
        out.status("ok", "marketplace_attach", `skills=${attached.skillsAdded.length}, mcps=${attached.mcpsAdded.length}`);
        if (attached.skillsAdded.length > 0) out.vkv("skills_added", attached.skillsAdded.join(", "));
        if (attached.mcpsAdded.length > 0) out.vkv("mcps_added", attached.mcpsAdded.join(", "));
      } else {
        out.vstatus("warn", "marketplace_attach", "no recommended resources selected");
      }
    }
  } catch (e) {
    out.vstatus("warn", "marketplace_recommend", e instanceof Error ? e.message : String(e));
  }

  let topology = buildRuleBasedTopology(
    {
      problem: discovery.problem,
      outcome: discovery.outcome,
      constraints: discovery.constraints
    },
    team
  );
  try {
    if (plannerExecMode === "live") {
      const topologyPrompt =
        `Design an execution-agent team topology for this project.\n` +
        `Must include a lead agent that coordinates the team.\n` +
        `Prefer 3-6 agents, each with clear contracts.\n` +
        `Return JSON only with keys: lead_id, rationale, agents, links.\n` +
        `agents[] keys: id, role, risk_level, model{primary,fallback}, skills[], mcps[], input_contract, output_contract.\n` +
        `links[] keys: from, to, trigger, output.\n\n` +
        `Discovery:\n${JSON.stringify(discovery, null, 2)}\n\n` +
        `Available skills:\n${team.resources.skills.map((s) => s.id).join(", ")}\n` +
        `Available mcps:\n${team.resources.mcps.map((m) => m.id).join(", ")}`;
      const aiTopology = await invokeModel(
        {
          model: plannerModel,
          prompt: topologyPrompt
        },
        "live"
      );
      topology = parseAiTopology(aiTopology.text, topology);
    }
  } catch (e) {
    out.vstatus("warn", "ai_topology_fallback", e instanceof Error ? e.message : String(e));
  }

  team.execution_plane.agents = topology.agents;
  const allSkillIds = new Set(team.resources.skills.map((s) => s.id));
  const allMcpIds = new Set(team.resources.mcps.map((m) => m.id));
  for (const agent of team.execution_plane.agents) {
    agent.skills = uniqueStrings(agent.skills.filter((id) => allSkillIds.has(id)));
    agent.mcps = uniqueStrings(agent.mcps.filter((id) => allMcpIds.has(id)));
  }
  const usedSkillIds = new Set(team.execution_plane.agents.flatMap((a) => a.skills));
  const usedMcpIds = new Set(team.execution_plane.agents.flatMap((a) => a.mcps));
  const leadAgent = team.execution_plane.agents.find((a) => a.id === topology.lead_id) ?? team.execution_plane.agents[0];
  if (leadAgent) {
    for (const sid of allSkillIds) {
      if (!usedSkillIds.has(sid)) leadAgent.skills.push(sid);
    }
    for (const mid of allMcpIds) {
      if (!usedMcpIds.has(mid)) leadAgent.mcps.push(mid);
    }
    leadAgent.skills = uniqueStrings(leadAgent.skills);
    leadAgent.mcps = uniqueStrings(leadAgent.mcps);
  }
  const topologyDocs = writeTopologyDocs(entryDir, team, topology);
  team.context_docs = uniqueStrings([...(team.context_docs ?? []), ...topologyDocs]);
  out.status("ok", "agent_topology", `agents=${team.execution_plane.agents.length}, lead=${topology.lead_id}, source=${topology.source}`);
  out.vkv("agent_ids", team.execution_plane.agents.map((a) => a.id).join(", "));
  out.vkv("topology_docs", topologyDocs.join(", "));
}

export async function runUpFlow(options: UpCommandOptions): Promise<UpFlowResult> {
  try {
    const verbose = Boolean(options.verbose);
    const silent = Boolean(options.silent);
    const out = createUpOutput(silent, verbose);

    let locale = resolveInteractionLocale(`${options.name ?? ""} ${options.goal ?? ""}`);
    const precheck = await runAiPrecheck(options, locale, out);
    if (!precheck.ok) {
      return { ok: false };
    }
    const plannerModel = precheck.plannerModel;
    const plannerExecMode = precheck.plannerExecMode;
    let discovery = await collectDiscovery({
      name: options.name,
      goal: options.goal,
      target: options.target,
      nonInteractive: Boolean(options.nonInteractive),
      locale,
      plannerModel,
      plannerExecMode,
      aiTurns: Math.max(1, Number(options.aiTurns ?? 2)),
      silent
    });
    locale = resolveInteractionLocale(`${discovery.teamName} ${discovery.problem} ${discovery.outcome}`);

    const target = discovery.target;
    const goal = `${discovery.problem}. Success outcome: ${discovery.outcome}. Constraints: ${discovery.constraints}.`;
    const entry = createTeamInRegistry(discovery.teamName, goal, Boolean(options.force));
    useRegistryTeam(entry.slug);


    out.banner(say(locale, "OpenTeam Up", "OpenTeam 初始化"), entry.name);
    out.kv("team_slug", entry.slug);
    out.kv("target", target);
    out.vkv("team_file", entry.team_file);
    out.vkv("planner_model", plannerModel);
    out.vkv("planner_mode", plannerExecMode);
    out.vkv("priority", discovery.priority);
    out.vkv("human_loop", discovery.humanLoop);

    const team = loadTeamConfig(entry.team_file);
    const plannerAgent = team.control_plane.manager_agents.find((a) => a.type === "planner" || a.id === "planner");
    if (plannerAgent) {
      plannerAgent.model = plannerModel;
    }
    applyDiscoveryHeuristics(team, discovery);
    await applyResourceAndTopology({
      entryDir: entry.team_dir,
      team,
      discovery,
      locale,
      plannerModel,
      plannerExecMode,
      nonInteractive: Boolean(options.nonInteractive),
      silent,
      out
    });

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
      out.status("warn", "planner_fallback", `AI planning unavailable, fallback to rule mode (${msg})`);
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
    out.vkv("discovery_note", discoveryPath);
    out.vkv("planning_note", notePath);

    const validation = validateTeamConfig(team);
    if (!validation.valid) {
      out.error(say(locale, "Schema validation failed.", "配置校验失败。"));
      for (const e of validation.errors) {
        out.status("fail", "schema", e);
      }
      return { ok: false };
    }
    for (const warning of validation.warnings) {
      out.status("warn", "schema_strict", warning);
    }
    out.success(say(locale, "Schema validation passed.", "配置校验通过。"));

    const strict = Boolean(options.strict);
    const policy = evaluatePolicies(team);
    const policyGate = assessGateFindings(policy.findings, strict);
    if (verbose) {
      for (const finding of policy.findings) {
        out.status(finding.severity, finding.code, finding.message);
      }
    } else {
      for (const finding of policyGate.fails) {
        out.status("fail", finding.code, finding.message);
      }
      if (policyGate.warns.length > 0) {
        out.vstatus("warn", "policy", `warnings=${policyGate.warns.length}`);
      }
    }
    if (policyGate.blocked) {
      out.error(say(locale, "Blocked by policy gate.", "被策略门禁阻断。"));
      out.info(say(locale, "Suggested: openteam policy show", "建议操作: openteam policy show"));
      return { ok: false };
    }

    const run = executeTask(team, options.task ?? "Draft an initial delivery plan", "simulate");
    const runPath = saveRunArtifact(run, team.observability.store.runs_dir);
    out.vkv("simulated_run", run.run_id);
    out.vkv("run_saved", runPath);

    const report = evaluateRun(team, run);
    const reportPath = saveEvalReport(report, team.observability.store.reports_dir);
    out.kv("eval_score", report.summary.overall_score);
    out.vkv("report_saved", reportPath);

    const compatibility = checkTargetCompatibility(team, target);
    const compatGate = assessGateFindings(compatibility.findings, strict);
    if (verbose) {
      for (const finding of compatibility.findings) {
        out.status(finding.severity, finding.code, finding.message);
      }
    } else {
      for (const finding of compatGate.fails) {
        out.status("fail", finding.code, finding.message);
      }
      if (compatGate.warns.length > 0) {
        out.status("warn", "compatibility", `${compatGate.warns.length} warnings (use --verbose to inspect)`);
      }
    }
    if (compatGate.blocked) {
      out.error(say(locale, "Blocked by compatibility gate.", "被兼容性检查阻断。"));
      out.info(say(
        locale,
        `Suggested: choose another target or run: openteam export --team ${entry.slug} --target <target> --out <project-path>`,
        `建议操作: 可切换目标，或执行: openteam export --team ${entry.slug} --target <target> --out <project-path>`
      ));
      return { ok: false };
    }

    out.success(say(locale, "Up flow completed.", "初始化流程完成。"));
    out.info(say(
      locale,
      `Suggested: openteam export --team ${entry.slug} --target ${target} --out <project-path>`,
      `建议操作: openteam export --team ${entry.slug} --target ${target} --out <project-path>`
    ));
    out.info(say(
      locale,
      "After export, worklog will be created at <project>/.openteam/worklog and can be monitored via `openteam monitor ...`.",
      "导出后会在 <project>/.openteam/worklog 生成工作日志，可用 `openteam monitor ...` 查看。"
    ));
    return { ok: true, team_slug: entry.slug, team_file: entry.team_file, target };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!Boolean(options.silent)) {
      error(msg);
      info("Next: run `openteam team list` or `openteam up --non-interactive` to recover quickly.");
    }
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
    .option("--force", "overwrite existing team when name/slug already exists", false)
    .option("--allow-mock", "allow mock fallback when AI auth is unavailable", false)
    .option("--ai-turns <n>", "interactive AI clarification turns (live mode only)", "2")
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
