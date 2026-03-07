import { TeamConfig } from "./types";
import type { TopologyLink } from "./dynamic-topology";
import topologyTemplatesJson from "../data/topology-templates.json";

export interface AgentTemplate {
  id: string;
  role: string;
  risk_level: "low" | "medium" | "high";
  model_primary: string;
  model_fallback: string[];
  skills: string[];
  mcps: string[];
  input_contract: string;
  output_contract: string;
}

export interface IndustryTopologyTemplate {
  id: string;
  name: string;
  keywords: string[];
  lead_id: string;
  rationale: string;
  agents: AgentTemplate[];
  links: TopologyLink[];
}

const BASE_LEAD: AgentTemplate = {
  id: "team_lead",
  role: "Lead agent: decompose goals, assign work, merge outputs, enforce approvals",
  risk_level: "medium",
  model_primary: "openai:gpt-5",
  model_fallback: ["openai:gpt-5-mini"],
  skills: ["planning", "coordination"],
  mcps: [],
  input_contract: "business_goal_and_constraints",
  output_contract: "execution_plan_and_assignments"
};

export const TOPOLOGY_TEMPLATES_BUILTIN: IndustryTopologyTemplate[] = [
  {
    id: "customer_support",
    name: "Customer Support Ops",
    keywords: ["support", "ticket", "triage", "客服", "工单", "分流"],
    lead_id: "team_lead",
    rationale: "tiered support escalation model",
    agents: [
      BASE_LEAD,
      {
        id: "triage_specialist",
        role: "Classify incoming issues and route to service queues",
        risk_level: "low",
        model_primary: "openai:gpt-5-mini",
        model_fallback: ["anthropic:claude-sonnet-4"],
        skills: ["support_ticket_classifier", "requirement_structuring"],
        mcps: ["jira-mcp", "slack-mcp"],
        input_contract: "ticket_stream",
        output_contract: "triage_decision"
      },
      {
        id: "resolution_specialist",
        role: "Resolve standard issues and draft responses",
        risk_level: "medium",
        model_primary: "openai:gpt-5-mini",
        model_fallback: ["openai:gpt-5"],
        skills: ["summarization", "knowledge_article_linking"],
        mcps: ["notion-mcp"],
        input_contract: "triage_decision",
        output_contract: "resolution_response"
      },
      {
        id: "escalation_reviewer",
        role: "Handle escalations and quality-check high impact replies",
        risk_level: "medium",
        model_primary: "openai:gpt-5",
        model_fallback: ["anthropic:claude-sonnet-4"],
        skills: ["qa_review", "risk_check"],
        mcps: [],
        input_contract: "resolution_response",
        output_contract: "approved_response"
      }
    ],
    links: [
      { from: "team_lead", to: "triage_specialist", trigger: "ticket batch arrived", output: "assignment" },
      { from: "triage_specialist", to: "resolution_specialist", trigger: "classified", output: "triage_decision" },
      { from: "resolution_specialist", to: "escalation_reviewer", trigger: "drafted", output: "resolution_response" },
      { from: "escalation_reviewer", to: "team_lead", trigger: "approved", output: "approved_response" }
    ]
  },
  {
    id: "software_delivery",
    name: "Software Delivery",
    keywords: ["release", "qa", "deploy", "开发", "测试", "发布", "交付"],
    lead_id: "team_lead",
    rationale: "plan-build-review-release pipeline",
    agents: [
      BASE_LEAD,
      {
        id: "planner_analyst",
        role: "Break requirements into implementation-ready specs",
        risk_level: "low",
        model_primary: "openai:gpt-5-mini",
        model_fallback: ["anthropic:claude-sonnet-4"],
        skills: ["requirement_structuring"],
        mcps: ["jira-mcp"],
        input_contract: "execution_plan_and_assignments",
        output_contract: "task_spec"
      },
      {
        id: "implementation_engineer",
        role: "Produce implementation artifacts",
        risk_level: "medium",
        model_primary: "openai:gpt-5-mini",
        model_fallback: ["openai:gpt-5"],
        skills: ["tool_calling"],
        mcps: ["github-mcp"],
        input_contract: "task_spec",
        output_contract: "implementation_output"
      },
      {
        id: "release_guard",
        role: "Assess release readiness and defect risks",
        risk_level: "medium",
        model_primary: "openai:gpt-5-mini",
        model_fallback: ["anthropic:claude-sonnet-4"],
        skills: ["release_risk_analyzer", "qa_review"],
        mcps: ["sentry-mcp"],
        input_contract: "implementation_output",
        output_contract: "release_risk_report"
      }
    ],
    links: [
      { from: "team_lead", to: "planner_analyst", trigger: "goal accepted", output: "assignment" },
      { from: "planner_analyst", to: "implementation_engineer", trigger: "spec done", output: "task_spec" },
      { from: "implementation_engineer", to: "release_guard", trigger: "candidate ready", output: "implementation_output" },
      { from: "release_guard", to: "team_lead", trigger: "review complete", output: "release_risk_report" }
    ]
  },
  {
    id: "cyber_incident_response",
    name: "Cyber Incident Response",
    keywords: ["security", "soc", "incident", "threat", "安全", "应急", "告警"],
    lead_id: "incident_commander",
    rationale: "incident commander + detection/forensics/communications model",
    agents: [
      {
        id: "incident_commander",
        role: "Coordinate response and prioritize containment actions",
        risk_level: "high",
        model_primary: "openai:gpt-5",
        model_fallback: ["anthropic:claude-sonnet-4"],
        skills: ["incident_coordination", "risk_check"],
        mcps: ["slack-mcp"],
        input_contract: "incident_alert",
        output_contract: "incident_command_plan"
      },
      {
        id: "detection_analyst",
        role: "Analyze alerts and identify attack patterns",
        risk_level: "medium",
        model_primary: "openai:gpt-5-mini",
        model_fallback: ["anthropic:claude-sonnet-4"],
        skills: ["threat_triage"],
        mcps: ["sentry-mcp"],
        input_contract: "incident_command_plan",
        output_contract: "threat_assessment"
      },
      {
        id: "forensics_specialist",
        role: "Perform evidence collection and timeline reconstruction",
        risk_level: "high",
        model_primary: "openai:gpt-5",
        model_fallback: ["anthropic:claude-sonnet-4"],
        skills: ["forensic_analysis"],
        mcps: [],
        input_contract: "threat_assessment",
        output_contract: "forensics_report"
      },
      {
        id: "response_comms",
        role: "Draft stakeholder updates and recovery communication",
        risk_level: "medium",
        model_primary: "openai:gpt-5-mini",
        model_fallback: ["openai:gpt-5"],
        skills: ["incident_communication"],
        mcps: ["slack-mcp", "feishu-mcp"],
        input_contract: "forensics_report",
        output_contract: "incident_update"
      }
    ],
    links: [
      { from: "incident_commander", to: "detection_analyst", trigger: "incident declared", output: "incident_command_plan" },
      { from: "detection_analyst", to: "forensics_specialist", trigger: "evidence needed", output: "threat_assessment" },
      { from: "forensics_specialist", to: "response_comms", trigger: "facts established", output: "forensics_report" },
      { from: "response_comms", to: "incident_commander", trigger: "update prepared", output: "incident_update" }
    ]
  },
  {
    id: "supply_chain",
    name: "Supply Chain Planning",
    keywords: ["supply", "procurement", "inventory", "logistics", "供应链", "采购", "库存", "物流"],
    lead_id: "team_lead",
    rationale: "plan-procure-fulfill-control-tower loop",
    agents: [
      BASE_LEAD,
      {
        id: "demand_planner",
        role: "Forecast demand and reconcile planning assumptions",
        risk_level: "medium",
        model_primary: "openai:gpt-5-mini",
        model_fallback: ["anthropic:claude-sonnet-4"],
        skills: ["demand_forecasting"],
        mcps: [],
        input_contract: "execution_plan_and_assignments",
        output_contract: "demand_plan"
      },
      {
        id: "procurement_coordinator",
        role: "Plan sourcing and supplier allocation",
        risk_level: "medium",
        model_primary: "openai:gpt-5-mini",
        model_fallback: ["openai:gpt-5"],
        skills: ["supplier_risk_assessment"],
        mcps: [],
        input_contract: "demand_plan",
        output_contract: "procurement_plan"
      },
      {
        id: "logistics_controller",
        role: "Track fulfillment risks and optimize delivery actions",
        risk_level: "medium",
        model_primary: "openai:gpt-5-mini",
        model_fallback: ["openai:gpt-5"],
        skills: ["logistics_exception_handling"],
        mcps: [],
        input_contract: "procurement_plan",
        output_contract: "fulfillment_plan"
      }
    ],
    links: [
      { from: "team_lead", to: "demand_planner", trigger: "cycle started", output: "assignment" },
      { from: "demand_planner", to: "procurement_coordinator", trigger: "forecast ready", output: "demand_plan" },
      { from: "procurement_coordinator", to: "logistics_controller", trigger: "sourcing finalized", output: "procurement_plan" },
      { from: "logistics_controller", to: "team_lead", trigger: "fulfillment updated", output: "fulfillment_plan" }
    ]
  },
  {
    id: "healthcare_safety",
    name: "Healthcare Safety / Pharmacovigilance",
    keywords: ["healthcare", "medical", "drug", "safety", "药物", "医疗", "不良反应"],
    lead_id: "safety_lead",
    rationale: "signal detection and risk management workflow",
    agents: [
      {
        id: "safety_lead",
        role: "Lead safety workflow and regulatory decision tracking",
        risk_level: "high",
        model_primary: "openai:gpt-5",
        model_fallback: ["anthropic:claude-sonnet-4"],
        skills: ["safety_governance"],
        mcps: [],
        input_contract: "safety_objective",
        output_contract: "safety_action_plan"
      },
      {
        id: "signal_detector",
        role: "Detect and prioritize safety signals from case data",
        risk_level: "high",
        model_primary: "openai:gpt-5-mini",
        model_fallback: ["anthropic:claude-sonnet-4"],
        skills: ["signal_detection"],
        mcps: [],
        input_contract: "safety_action_plan",
        output_contract: "signal_assessment"
      },
      {
        id: "risk_evaluator",
        role: "Evaluate benefit-risk and mitigation options",
        risk_level: "high",
        model_primary: "openai:gpt-5",
        model_fallback: ["anthropic:claude-sonnet-4"],
        skills: ["risk_benefit_analysis"],
        mcps: [],
        input_contract: "signal_assessment",
        output_contract: "risk_recommendation"
      },
      {
        id: "regulatory_comms",
        role: "Prepare compliant safety communication drafts",
        risk_level: "high",
        model_primary: "openai:gpt-5-mini",
        model_fallback: ["openai:gpt-5"],
        skills: ["regulatory_writing"],
        mcps: [],
        input_contract: "risk_recommendation",
        output_contract: "regulatory_update"
      }
    ],
    links: [
      { from: "safety_lead", to: "signal_detector", trigger: "surveillance cycle", output: "safety_action_plan" },
      { from: "signal_detector", to: "risk_evaluator", trigger: "signal found", output: "signal_assessment" },
      { from: "risk_evaluator", to: "regulatory_comms", trigger: "decision prepared", output: "risk_recommendation" },
      { from: "regulatory_comms", to: "safety_lead", trigger: "submission ready", output: "regulatory_update" }
    ]
  },
  {
    id: "finance_risk_control",
    name: "Finance Risk Control",
    keywords: ["finance", "fraud", "risk", "aml", "kyc", "金融", "风控", "反洗钱", "欺诈"],
    lead_id: "risk_lead",
    rationale: "risk triage + policy decision + manual review escalation",
    agents: [
      {
        id: "risk_lead",
        role: "Own risk strategy, thresholds, and approval routing",
        risk_level: "high",
        model_primary: "openai:gpt-5",
        model_fallback: ["anthropic:claude-sonnet-4"],
        skills: ["risk_policy_orchestration"],
        mcps: ["banking-ledger-mcp"],
        input_contract: "risk_control_goal",
        output_contract: "risk_decision_policy"
      },
      {
        id: "transaction_monitor",
        role: "Detect anomalies and suspicious transaction patterns",
        risk_level: "high",
        model_primary: "openai:gpt-5-mini",
        model_fallback: ["anthropic:claude-sonnet-4"],
        skills: ["transaction_anomaly_detection", "threat_triage"],
        mcps: ["banking-ledger-mcp", "snowflake-mcp"],
        input_contract: "risk_decision_policy",
        output_contract: "risk_alerts"
      },
      {
        id: "compliance_checker",
        role: "Validate cases against AML/KYC and internal controls",
        risk_level: "high",
        model_primary: "openai:gpt-5",
        model_fallback: ["anthropic:claude-sonnet-4"],
        skills: ["aml_kyc_compliance_review", "regulatory_writing"],
        mcps: ["case-management-mcp"],
        input_contract: "risk_alerts",
        output_contract: "compliance_disposition"
      },
      {
        id: "case_investigator",
        role: "Prepare investigation evidence and escalation packages",
        risk_level: "high",
        model_primary: "openai:gpt-5-mini",
        model_fallback: ["openai:gpt-5"],
        skills: ["case_prioritization"],
        mcps: ["case-management-mcp"],
        input_contract: "compliance_disposition",
        output_contract: "investigation_case"
      }
    ],
    links: [
      { from: "risk_lead", to: "transaction_monitor", trigger: "monitoring cycle", output: "risk_decision_policy" },
      { from: "transaction_monitor", to: "compliance_checker", trigger: "suspicious alert", output: "risk_alerts" },
      { from: "compliance_checker", to: "case_investigator", trigger: "manual review needed", output: "compliance_disposition" },
      { from: "case_investigator", to: "risk_lead", trigger: "case package done", output: "investigation_case" }
    ]
  },
  {
    id: "ecommerce_operations",
    name: "Ecommerce Operations",
    keywords: ["ecommerce", "shop", "order", "catalog", "conversion", "电商", "订单", "履约", "营销"],
    lead_id: "ops_lead",
    rationale: "catalog-demand-fulfillment-growth closed loop",
    agents: [
      {
        id: "ops_lead",
        role: "Coordinate merchandising, fulfillment, and growth actions",
        risk_level: "medium",
        model_primary: "openai:gpt-5",
        model_fallback: ["openai:gpt-5-mini"],
        skills: ["ops_orchestration"],
        mcps: ["shopify-mcp"],
        input_contract: "growth_and_ops_goal",
        output_contract: "ops_execution_plan"
      },
      {
        id: "catalog_optimizer",
        role: "Improve product listing quality and discoverability",
        risk_level: "low",
        model_primary: "openai:gpt-5-mini",
        model_fallback: ["anthropic:claude-sonnet-4"],
        skills: ["catalog_optimization"],
        mcps: ["shopify-mcp"],
        input_contract: "ops_execution_plan",
        output_contract: "catalog_changes"
      },
      {
        id: "demand_analyst",
        role: "Analyze demand and promotion impact",
        risk_level: "medium",
        model_primary: "openai:gpt-5-mini",
        model_fallback: ["openai:gpt-5"],
        skills: ["demand_forecasting", "promotion_effect_analysis"],
        mcps: ["snowflake-mcp"],
        input_contract: "catalog_changes",
        output_contract: "demand_recommendation"
      },
      {
        id: "fulfillment_controller",
        role: "Track delivery exceptions and drive service recovery",
        risk_level: "medium",
        model_primary: "openai:gpt-5-mini",
        model_fallback: ["openai:gpt-5"],
        skills: ["logistics_exception_handling"],
        mcps: ["shopify-mcp", "slack-mcp"],
        input_contract: "demand_recommendation",
        output_contract: "fulfillment_actions"
      }
    ],
    links: [
      { from: "ops_lead", to: "catalog_optimizer", trigger: "weekly cycle", output: "ops_execution_plan" },
      { from: "catalog_optimizer", to: "demand_analyst", trigger: "catalog updates proposed", output: "catalog_changes" },
      { from: "demand_analyst", to: "fulfillment_controller", trigger: "demand plan ready", output: "demand_recommendation" },
      { from: "fulfillment_controller", to: "ops_lead", trigger: "exception loop complete", output: "fulfillment_actions" }
    ]
  },
  {
    id: "education_content",
    name: "Education Content Production",
    keywords: ["education", "course", "learning", "curriculum", "quiz", "教育", "课程", "教学", "题库"],
    lead_id: "curriculum_lead",
    rationale: "curriculum planning -> content authoring -> pedagogy review",
    agents: [
      {
        id: "curriculum_lead",
        role: "Define course objectives and learning outcomes",
        risk_level: "medium",
        model_primary: "openai:gpt-5",
        model_fallback: ["openai:gpt-5-mini"],
        skills: ["curriculum_planning"],
        mcps: ["lms-mcp"],
        input_contract: "course_goal",
        output_contract: "curriculum_plan"
      },
      {
        id: "content_author",
        role: "Generate lessons, examples, and assignments",
        risk_level: "medium",
        model_primary: "openai:gpt-5-mini",
        model_fallback: ["anthropic:claude-sonnet-4"],
        skills: ["lesson_authoring", "summarization"],
        mcps: ["lms-mcp", "notion-mcp"],
        input_contract: "curriculum_plan",
        output_contract: "draft_lessons"
      },
      {
        id: "assessment_designer",
        role: "Design quizzes and outcome-aligned assessments",
        risk_level: "medium",
        model_primary: "openai:gpt-5-mini",
        model_fallback: ["openai:gpt-5"],
        skills: ["assessment_design"],
        mcps: ["lms-mcp"],
        input_contract: "draft_lessons",
        output_contract: "assessment_pack"
      },
      {
        id: "pedagogy_reviewer",
        role: "Review clarity, progression, and cognitive load",
        risk_level: "low",
        model_primary: "openai:gpt-5-mini",
        model_fallback: ["anthropic:claude-sonnet-4"],
        skills: ["pedagogy_review", "qa_review"],
        mcps: [],
        input_contract: "assessment_pack",
        output_contract: "teaching_quality_report"
      }
    ],
    links: [
      { from: "curriculum_lead", to: "content_author", trigger: "plan approved", output: "curriculum_plan" },
      { from: "content_author", to: "assessment_designer", trigger: "lesson draft ready", output: "draft_lessons" },
      { from: "assessment_designer", to: "pedagogy_reviewer", trigger: "assessment completed", output: "assessment_pack" },
      { from: "pedagogy_reviewer", to: "curriculum_lead", trigger: "review completed", output: "teaching_quality_report" }
    ]
  },
  {
    id: "legal_contract_review",
    name: "Legal Contract Review",
    keywords: ["legal", "contract", "clause", "compliance", "法务", "合同", "条款", "审查"],
    lead_id: "legal_lead",
    rationale: "intake -> clause analysis -> risk review -> negotiation brief",
    agents: [
      {
        id: "legal_lead",
        role: "Control legal strategy and final contract decision",
        risk_level: "high",
        model_primary: "openai:gpt-5",
        model_fallback: ["anthropic:claude-sonnet-4"],
        skills: ["legal_strategy_planning"],
        mcps: ["docusign-mcp"],
        input_contract: "contract_request",
        output_contract: "review_scope"
      },
      {
        id: "clause_analyst",
        role: "Extract and classify clauses against playbook",
        risk_level: "high",
        model_primary: "openai:gpt-5-mini",
        model_fallback: ["anthropic:claude-sonnet-4"],
        skills: ["clause_extraction", "contract_playbook_matching"],
        mcps: ["docusign-mcp"],
        input_contract: "review_scope",
        output_contract: "clause_matrix"
      },
      {
        id: "compliance_reviewer",
        role: "Assess regulatory/privacy/data obligations",
        risk_level: "high",
        model_primary: "openai:gpt-5",
        model_fallback: ["anthropic:claude-sonnet-4"],
        skills: ["compliance_obligation_review", "regulatory_writing"],
        mcps: ["case-management-mcp"],
        input_contract: "clause_matrix",
        output_contract: "compliance_risk_report"
      },
      {
        id: "negotiation_writer",
        role: "Draft redlines and negotiation brief",
        risk_level: "high",
        model_primary: "openai:gpt-5-mini",
        model_fallback: ["openai:gpt-5"],
        skills: ["redline_drafting"],
        mcps: ["docusign-mcp", "notion-mcp"],
        input_contract: "compliance_risk_report",
        output_contract: "negotiation_brief"
      }
    ],
    links: [
      { from: "legal_lead", to: "clause_analyst", trigger: "contract intake", output: "review_scope" },
      { from: "clause_analyst", to: "compliance_reviewer", trigger: "matrix prepared", output: "clause_matrix" },
      { from: "compliance_reviewer", to: "negotiation_writer", trigger: "risk assessed", output: "compliance_risk_report" },
      { from: "negotiation_writer", to: "legal_lead", trigger: "redline package ready", output: "negotiation_brief" }
    ]
  }
];

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((x) => typeof x === "string");
}

function validateTopologyTemplates(raw: unknown): IndustryTopologyTemplate[] | null {
  if (!Array.isArray(raw)) return null;
  const out: IndustryTopologyTemplate[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") return null;
    const r = row as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.name !== "string" || typeof r.lead_id !== "string" || typeof r.rationale !== "string") return null;
    if (!isStringArray(r.keywords)) return null;
    if (!Array.isArray(r.agents) || !Array.isArray(r.links)) return null;
    const agents: AgentTemplate[] = [];
    for (const aRaw of r.agents) {
      if (!aRaw || typeof aRaw !== "object") return null;
      const a = aRaw as Record<string, unknown>;
      if (typeof a.id !== "string" || typeof a.role !== "string") return null;
      if (a.risk_level !== "low" && a.risk_level !== "medium" && a.risk_level !== "high") return null;
      if (typeof a.model_primary !== "string" || !isStringArray(a.model_fallback)) return null;
      if (!isStringArray(a.skills) || !isStringArray(a.mcps)) return null;
      if (typeof a.input_contract !== "string" || typeof a.output_contract !== "string") return null;
      agents.push({
        id: a.id,
        role: a.role,
        risk_level: a.risk_level,
        model_primary: a.model_primary,
        model_fallback: a.model_fallback,
        skills: a.skills,
        mcps: a.mcps,
        input_contract: a.input_contract,
        output_contract: a.output_contract
      });
    }
    const links: TopologyLink[] = [];
    for (const lRaw of r.links) {
      if (!lRaw || typeof lRaw !== "object") return null;
      const l = lRaw as Record<string, unknown>;
      if (typeof l.from !== "string" || typeof l.to !== "string" || typeof l.trigger !== "string" || typeof l.output !== "string") return null;
      links.push({
        from: l.from,
        to: l.to,
        trigger: l.trigger,
        output: l.output
      });
    }
    out.push({
      id: r.id,
      name: r.name,
      keywords: r.keywords,
      lead_id: r.lead_id,
      rationale: r.rationale,
      agents,
      links
    });
  }
  return out;
}

export function loadTopologyTemplates(): IndustryTopologyTemplate[] {
  const validated = validateTopologyTemplates(topologyTemplatesJson);
  if (!validated || validated.length === 0) {
    return TOPOLOGY_TEMPLATES_BUILTIN;
  }
  return validated;
}

function tokenize(input: string): string[] {
  return (input || "")
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/g)
    .filter((x) => x.length >= 2);
}

function scoreTemplate(template: IndustryTopologyTemplate, queryTokens: string[]): number {
  let score = 0;
  for (const token of queryTokens) {
    if (template.keywords.some((k) => k.toLowerCase() === token)) score += 4;
    if (template.keywords.some((k) => k.toLowerCase().includes(token))) score += 2;
    if (template.name.toLowerCase().includes(token)) score += 1;
  }
  return score;
}

function toExecutionAgents(template: IndustryTopologyTemplate, team: TeamConfig): TeamConfig["execution_plane"]["agents"] {
  const skillSet = new Set(team.resources.skills.map((s) => s.id));
  const mcpSet = new Set(team.resources.mcps.map((m) => m.id));
  return template.agents.map((a) => ({
    id: a.id,
    role: a.role,
    risk_level: a.risk_level,
    model: {
      primary: a.model_primary,
      fallback: a.model_fallback
    },
    skills: a.skills.filter((s) => skillSet.has(s)),
    mcps: a.mcps.filter((m) => mcpSet.has(m)),
    input_contract: a.input_contract,
    output_contract: a.output_contract
  }));
}

export function selectIndustryTopologyTemplate(
  input: { problem: string; outcome: string; constraints: string },
  team: TeamConfig
): { templateId: string; rationale: string; leadId: string; agents: TeamConfig["execution_plane"]["agents"]; links: TopologyLink[] } {
  const templates = loadTopologyTemplates();
  const queryTokens = tokenize(`${input.problem} ${input.outcome} ${input.constraints}`);
  const scored = templates.map((t) => ({ t, score: scoreTemplate(t, queryTokens) })).sort((a, b) => b.score - a.score);
  const picked = scored[0]?.score > 0 ? scored[0].t : templates.find((t) => t.id === "software_delivery") ?? templates[0];
  return {
    templateId: picked.id,
    rationale: picked.rationale,
    leadId: picked.lead_id,
    agents: toExecutionAgents(picked, team),
    links: picked.links
  };
}
