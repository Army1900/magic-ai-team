import { OpenTeamConfig, SkillResource, McpResource, TeamConfig } from "./types";
import marketplaceCatalogJson from "../data/marketplace-catalog.json";

type ResourceType = "skill" | "mcp";

export interface CatalogSkill extends SkillResource {
  type: "skill";
  title: string;
  tags: string[];
}

export interface CatalogMcp extends McpResource {
  type: "mcp";
  title: string;
  tags: string[];
}

export type MarketplaceCandidate = CatalogSkill | CatalogMcp;

export interface RecommendInput {
  teamName: string;
  problem: string;
  outcome: string;
  constraints: string;
}

export const MARKETPLACE_CATALOG_BUILTIN: MarketplaceCandidate[] = [
  {
    type: "skill",
    id: "support_ticket_classifier",
    title: "Support Ticket Classifier",
    source: "marketplace:official",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.9,
    risk_level: "low",
    tags: ["support", "ticket", "triage", "classification", "客服", "工单", "分流"]
  },
  {
    type: "skill",
    id: "release_risk_analyzer",
    title: "Release Risk Analyzer",
    source: "marketplace:official",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.88,
    risk_level: "medium",
    tags: ["release", "qa", "defect", "risk", "发布", "测试", "缺陷"]
  },
  {
    type: "skill",
    id: "product_feedback_mining",
    title: "Product Feedback Mining",
    source: "marketplace:github",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.84,
    risk_level: "low",
    tags: ["feedback", "insight", "weekly", "analysis", "产品", "洞察", "分析"]
  },
  {
    type: "skill",
    id: "requirement_structuring",
    title: "Requirement Structuring",
    source: "marketplace:official",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.9,
    risk_level: "low",
    tags: ["requirement", "scope", "planning", "需求", "规划", "范围"]
  },
  {
    type: "skill",
    id: "knowledge_article_linking",
    title: "Knowledge Article Linking",
    source: "marketplace:official",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.86,
    risk_level: "low",
    tags: ["knowledge", "kb", "support", "文档", "知识库", "客服"]
  },
  {
    type: "skill",
    id: "incident_coordination",
    title: "Incident Coordination",
    source: "marketplace:official",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.87,
    risk_level: "medium",
    tags: ["incident", "security", "response", "应急", "安全"]
  },
  {
    type: "skill",
    id: "threat_triage",
    title: "Threat Triage",
    source: "marketplace:official",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.83,
    risk_level: "medium",
    tags: ["threat", "soc", "security", "告警", "威胁", "安全"]
  },
  {
    type: "skill",
    id: "forensic_analysis",
    title: "Forensic Analysis",
    source: "marketplace:github",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.78,
    risk_level: "high",
    tags: ["forensics", "evidence", "incident", "取证", "证据"]
  },
  {
    type: "skill",
    id: "incident_communication",
    title: "Incident Communication",
    source: "marketplace:official",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.88,
    risk_level: "low",
    tags: ["communication", "incident", "stakeholder", "通报", "沟通"]
  },
  {
    type: "skill",
    id: "demand_forecasting",
    title: "Demand Forecasting",
    source: "marketplace:official",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.85,
    risk_level: "medium",
    tags: ["forecast", "demand", "supply", "预测", "需求", "供应链"]
  },
  {
    type: "skill",
    id: "supplier_risk_assessment",
    title: "Supplier Risk Assessment",
    source: "marketplace:official",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.84,
    risk_level: "medium",
    tags: ["supplier", "procurement", "risk", "供应商", "采购", "风险"]
  },
  {
    type: "skill",
    id: "logistics_exception_handling",
    title: "Logistics Exception Handling",
    source: "marketplace:github",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.8,
    risk_level: "medium",
    tags: ["logistics", "delivery", "exception", "物流", "配送", "异常"]
  },
  {
    type: "skill",
    id: "safety_governance",
    title: "Safety Governance",
    source: "marketplace:official",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.89,
    risk_level: "high",
    tags: ["safety", "healthcare", "governance", "医疗", "药物", "安全"]
  },
  {
    type: "skill",
    id: "signal_detection",
    title: "Signal Detection",
    source: "marketplace:official",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.88,
    risk_level: "high",
    tags: ["signal", "pharmacovigilance", "safety", "信号", "药物", "不良反应"]
  },
  {
    type: "skill",
    id: "risk_benefit_analysis",
    title: "Risk Benefit Analysis",
    source: "marketplace:official",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.9,
    risk_level: "high",
    tags: ["benefit", "risk", "medical", "风险收益", "医疗"]
  },
  {
    type: "skill",
    id: "regulatory_writing",
    title: "Regulatory Writing",
    source: "marketplace:github",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.82,
    risk_level: "high",
    tags: ["regulatory", "compliance", "submission", "法规", "合规", "申报"]
  },
  {
    type: "skill",
    id: "risk_policy_orchestration",
    title: "Risk Policy Orchestration",
    source: "marketplace:official",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.9,
    risk_level: "high",
    tags: ["risk", "policy", "finance", "风控", "策略", "金融"]
  },
  {
    type: "skill",
    id: "transaction_anomaly_detection",
    title: "Transaction Anomaly Detection",
    source: "marketplace:official",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.89,
    risk_level: "high",
    tags: ["transaction", "fraud", "anomaly", "交易", "欺诈", "异常"]
  },
  {
    type: "skill",
    id: "aml_kyc_compliance_review",
    title: "AML KYC Compliance Review",
    source: "marketplace:official",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.91,
    risk_level: "high",
    tags: ["aml", "kyc", "compliance", "反洗钱", "尽调", "合规"]
  },
  {
    type: "skill",
    id: "case_prioritization",
    title: "Case Prioritization",
    source: "marketplace:github",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.85,
    risk_level: "medium",
    tags: ["case", "investigation", "priority", "案件", "调查", "优先级"]
  },
  {
    type: "skill",
    id: "ops_orchestration",
    title: "Operations Orchestration",
    source: "marketplace:official",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.88,
    risk_level: "medium",
    tags: ["operations", "orchestration", "workflow", "运营", "协同", "流程"]
  },
  {
    type: "skill",
    id: "catalog_optimization",
    title: "Catalog Optimization",
    source: "marketplace:official",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.84,
    risk_level: "low",
    tags: ["catalog", "listing", "ecommerce", "商品", "电商", "详情页"]
  },
  {
    type: "skill",
    id: "promotion_effect_analysis",
    title: "Promotion Effect Analysis",
    source: "marketplace:github",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.82,
    risk_level: "medium",
    tags: ["promotion", "campaign", "conversion", "促销", "营销", "转化"]
  },
  {
    type: "skill",
    id: "curriculum_planning",
    title: "Curriculum Planning",
    source: "marketplace:official",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.9,
    risk_level: "medium",
    tags: ["curriculum", "learning", "education", "课程", "教学", "学习"]
  },
  {
    type: "skill",
    id: "lesson_authoring",
    title: "Lesson Authoring",
    source: "marketplace:official",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.87,
    risk_level: "medium",
    tags: ["lesson", "content", "education", "教案", "内容", "教学"]
  },
  {
    type: "skill",
    id: "assessment_design",
    title: "Assessment Design",
    source: "marketplace:official",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.86,
    risk_level: "medium",
    tags: ["assessment", "quiz", "exam", "测评", "题库", "考试"]
  },
  {
    type: "skill",
    id: "pedagogy_review",
    title: "Pedagogy Review",
    source: "marketplace:github",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.83,
    risk_level: "low",
    tags: ["pedagogy", "teaching", "learning", "教研", "教学法", "学习"]
  },
  {
    type: "skill",
    id: "legal_strategy_planning",
    title: "Legal Strategy Planning",
    source: "marketplace:official",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.9,
    risk_level: "high",
    tags: ["legal", "strategy", "contract", "法务", "策略", "合同"]
  },
  {
    type: "skill",
    id: "clause_extraction",
    title: "Clause Extraction",
    source: "marketplace:official",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.89,
    risk_level: "high",
    tags: ["clause", "contract", "analysis", "条款", "合同", "抽取"]
  },
  {
    type: "skill",
    id: "contract_playbook_matching",
    title: "Contract Playbook Matching",
    source: "marketplace:github",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.85,
    risk_level: "high",
    tags: ["playbook", "contract", "legal", "法务", "合同", "规则库"]
  },
  {
    type: "skill",
    id: "compliance_obligation_review",
    title: "Compliance Obligation Review",
    source: "marketplace:official",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.9,
    risk_level: "high",
    tags: ["obligation", "compliance", "legal", "义务", "合规", "法务"]
  },
  {
    type: "skill",
    id: "redline_drafting",
    title: "Redline Drafting",
    source: "marketplace:official",
    version: "1.0.0",
    license: "MIT",
    trust_score: 0.88,
    risk_level: "high",
    tags: ["redline", "negotiation", "contract", "修订", "谈判", "合同"]
  },
  {
    type: "mcp",
    id: "jira-mcp",
    title: "Jira MCP",
    source: "marketplace:official",
    version: "1.0.0",
    auth: "oauth2",
    permissions: ["jira:read", "jira:write"],
    risk_level: "medium",
    tags: ["jira", "ticket", "project", "issue", "工单", "任务", "缺陷"]
  },
  {
    type: "mcp",
    id: "slack-mcp",
    title: "Slack MCP",
    source: "marketplace:official",
    version: "1.0.0",
    auth: "oauth2",
    permissions: ["channel:read", "message:write"],
    risk_level: "medium",
    tags: ["slack", "notification", "incident", "chat", "通知", "沟通", "告警"]
  },
  {
    type: "mcp",
    id: "sentry-mcp",
    title: "Sentry MCP",
    source: "marketplace:github",
    version: "1.0.0",
    auth: "token",
    permissions: ["issue:read", "event:read"],
    risk_level: "medium",
    tags: ["sentry", "error", "incident", "qa", "异常", "告警", "质量"]
  },
  {
    type: "mcp",
    id: "servicenow-mcp",
    title: "ServiceNow MCP",
    source: "marketplace:official",
    version: "1.0.0",
    auth: "oauth2",
    permissions: ["incident:read", "incident:write", "change:read"],
    risk_level: "medium",
    tags: ["servicenow", "incident", "itsm", "运维", "工单", "应急"]
  },
  {
    type: "mcp",
    id: "salesforce-mcp",
    title: "Salesforce MCP",
    source: "marketplace:official",
    version: "1.0.0",
    auth: "oauth2",
    permissions: ["case:read", "case:write", "account:read"],
    risk_level: "medium",
    tags: ["crm", "customer", "salesforce", "客户", "线索", "工单"]
  },
  {
    type: "mcp",
    id: "shopify-mcp",
    title: "Shopify MCP",
    source: "marketplace:github",
    version: "1.0.0",
    auth: "token",
    permissions: ["orders:read", "products:read", "customers:read"],
    risk_level: "medium",
    tags: ["shopify", "ecommerce", "order", "电商", "订单"]
  },
  {
    type: "mcp",
    id: "snowflake-mcp",
    title: "Snowflake MCP",
    source: "marketplace:official",
    version: "1.0.0",
    auth: "oauth2",
    permissions: ["warehouse:read", "query:execute"],
    risk_level: "medium",
    tags: ["warehouse", "analytics", "bi", "数仓", "分析", "洞察"]
  },
  {
    type: "mcp",
    id: "sap-mcp",
    title: "SAP MCP",
    source: "marketplace:official",
    version: "1.0.0",
    auth: "oauth2",
    permissions: ["material:read", "purchase:read", "delivery:read"],
    risk_level: "high",
    tags: ["sap", "supply", "procurement", "供应链", "采购", "物流"]
  },
  {
    type: "mcp",
    id: "banking-ledger-mcp",
    title: "Banking Ledger MCP",
    source: "marketplace:official",
    version: "1.0.0",
    auth: "oauth2",
    permissions: ["ledger:read", "transaction:read"],
    risk_level: "high",
    tags: ["banking", "ledger", "transaction", "银行", "账本", "交易"]
  },
  {
    type: "mcp",
    id: "case-management-mcp",
    title: "Case Management MCP",
    source: "marketplace:official",
    version: "1.0.0",
    auth: "oauth2",
    permissions: ["case:read", "case:write"],
    risk_level: "high",
    tags: ["case", "workflow", "compliance", "案件", "流程", "合规"]
  },
  {
    type: "mcp",
    id: "lms-mcp",
    title: "LMS MCP",
    source: "marketplace:github",
    version: "1.0.0",
    auth: "token",
    permissions: ["course:read", "course:write", "quiz:write"],
    risk_level: "medium",
    tags: ["lms", "course", "education", "教学平台", "课程", "教育"]
  },
  {
    type: "mcp",
    id: "docusign-mcp",
    title: "DocuSign MCP",
    source: "marketplace:official",
    version: "1.0.0",
    auth: "oauth2",
    permissions: ["document:read", "envelope:write"],
    risk_level: "high",
    tags: ["contract", "signature", "legal", "合同", "签署", "法务"]
  },
  {
    type: "mcp",
    id: "feishu-mcp",
    title: "Feishu MCP",
    source: "marketplace:official",
    version: "1.0.0",
    auth: "oauth2",
    permissions: ["doc:read", "doc:write", "chat:write"],
    risk_level: "medium",
    tags: ["feishu", "document", "chat", "飞书", "文档", "沟通"]
  }
];

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((x) => typeof x === "string");
}

function validateCatalog(raw: unknown): MarketplaceCandidate[] | null {
  if (!Array.isArray(raw)) return null;
  const out: MarketplaceCandidate[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") return null;
    const r = row as Record<string, unknown>;
    if (r.type !== "skill" && r.type !== "mcp") return null;
    if (typeof r.id !== "string" || typeof r.title !== "string" || typeof r.source !== "string" || typeof r.version !== "string") return null;
    if (!isStringArray(r.tags)) return null;
    if (r.risk_level !== undefined && typeof r.risk_level !== "string") return null;
    if (r.type === "skill") {
      if (r.trust_score !== undefined && typeof r.trust_score !== "number") return null;
      if (r.license !== undefined && typeof r.license !== "string") return null;
      out.push({
        type: "skill",
        id: r.id,
        title: r.title,
        source: r.source,
        version: r.version,
        license: typeof r.license === "string" ? r.license : undefined,
        trust_score: typeof r.trust_score === "number" ? r.trust_score : undefined,
        risk_level: typeof r.risk_level === "string" ? r.risk_level : undefined,
        tags: r.tags
      });
      continue;
    }
    if (r.auth !== undefined && typeof r.auth !== "string") return null;
    if (r.permissions !== undefined && !isStringArray(r.permissions)) return null;
    out.push({
      type: "mcp",
      id: r.id,
      title: r.title,
      source: r.source,
      version: r.version,
      auth: typeof r.auth === "string" ? r.auth : undefined,
      permissions: isStringArray(r.permissions) ? r.permissions : undefined,
      risk_level: typeof r.risk_level === "string" ? r.risk_level : undefined,
      tags: r.tags
    });
  }
  return out;
}

export function loadMarketplaceCatalog(): MarketplaceCandidate[] {
  const validated = validateCatalog(marketplaceCatalogJson);
  if (!validated || validated.length === 0) {
    return MARKETPLACE_CATALOG_BUILTIN;
  }
  return validated;
}

function normalizeText(input: string): string {
  return (input || "").toLowerCase();
}

function tokenize(input: string): string[] {
  return normalizeText(input)
    .split(/[^a-z0-9\u4e00-\u9fff]+/g)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

function sourceId(source: string): string {
  const idx = source.indexOf(":");
  return idx >= 0 ? source.slice(idx + 1) : source;
}

function sourceEnabled(config: OpenTeamConfig, candidate: MarketplaceCandidate): boolean {
  const enabled = config.marketplaces.filter((m) => m.enabled).map((m) => m.id);
  if (enabled.length === 0) return true;
  return enabled.includes(sourceId(candidate.source));
}

function aboveTrust(config: OpenTeamConfig, candidate: MarketplaceCandidate): boolean {
  if (candidate.type === "mcp") return true;
  const minTrust = config.resolution_policy?.min_trust_score ?? 0;
  return (candidate.trust_score ?? 0) >= minTrust;
}

function scoreCandidate(candidate: MarketplaceCandidate, queryTokens: string[]): number {
  let score = 0;
  const id = normalizeText(candidate.id);
  const title = normalizeText(candidate.title);
  for (const token of queryTokens) {
    if (candidate.tags.includes(token)) score += 4;
    if (id.includes(token)) score += 2;
    if (title.includes(token)) score += 1;
  }
  if ((candidate.risk_level ?? "low") === "low") score += 1;
  if (candidate.type === "skill" && (candidate.trust_score ?? 0) >= 0.9) score += 1;
  return score;
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function recommendMarketplaceCandidates(
  input: RecommendInput,
  team: TeamConfig,
  config: OpenTeamConfig,
  limits: { skills?: number; mcps?: number } = {}
): MarketplaceCandidate[] {
  const query = `${input.teamName} ${input.problem} ${input.outcome} ${input.constraints}`;
  const tokens = tokenize(query);
  const existingSkillIds = new Set(team.resources.skills.map((s) => s.id));
  const existingMcpIds = new Set(team.resources.mcps.map((m) => m.id));
  const maxSkills = Math.max(0, limits.skills ?? 3);
  const maxMcps = Math.max(0, limits.mcps ?? 3);

  const catalog = loadMarketplaceCatalog();
  const scored = catalog.filter((c) => sourceEnabled(config, c) && aboveTrust(config, c))
    .map((c) => ({ c, score: scoreCandidate(c, tokens) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.c);

  const skills = uniqueById(scored.filter((c): c is CatalogSkill => c.type === "skill"))
    .filter((c) => !existingSkillIds.has(c.id))
    .slice(0, maxSkills);
  const mcps = uniqueById(scored.filter((c): c is CatalogMcp => c.type === "mcp"))
    .filter((c) => !existingMcpIds.has(c.id))
    .slice(0, maxMcps);

  return [...skills, ...mcps];
}

export function attachRecommendedResources(team: TeamConfig, selected: MarketplaceCandidate[]): {
  skillsAdded: string[];
  mcpsAdded: string[];
} {
  const skillsAdded: string[] = [];
  const mcpsAdded: string[] = [];
  const skillSet = new Set(team.resources.skills.map((s) => s.id));
  const mcpSet = new Set(team.resources.mcps.map((m) => m.id));

  for (const item of selected) {
    if (item.type === "skill") {
      if (skillSet.has(item.id)) continue;
      team.resources.skills.push({
        id: item.id,
        source: item.source,
        version: item.version,
        license: item.license,
        trust_score: item.trust_score,
        risk_level: item.risk_level
      });
      skillSet.add(item.id);
      skillsAdded.push(item.id);
      if (team.execution_plane.agents[0] && !team.execution_plane.agents[0].skills.includes(item.id)) {
        team.execution_plane.agents[0].skills.push(item.id);
      }
      continue;
    }
    if (mcpSet.has(item.id)) continue;
    team.resources.mcps.push({
      id: item.id,
      source: item.source,
      version: item.version,
      auth: item.auth,
      permissions: item.permissions,
      risk_level: item.risk_level
    });
    mcpSet.add(item.id);
    mcpsAdded.push(item.id);
    const executor = team.execution_plane.agents.find((a) => a.id === "executor") ?? team.execution_plane.agents[0];
    if (executor && !executor.mcps.includes(item.id)) {
      executor.mcps.push(item.id);
    }
  }

  return { skillsAdded, mcpsAdded };
}
