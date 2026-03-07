import { TeamConfig } from "./types";
import { selectIndustryTopologyTemplate } from "./team-topology-templates";

export interface TopologyLink {
  from: string;
  to: string;
  trigger: string;
  output: string;
}

export interface TopologyDesign {
  source: "ai" | "rule";
  agents: TeamConfig["execution_plane"]["agents"];
  lead_id: string;
  links: TopologyLink[];
  rationale: string;
}

export interface DiscoveryLike {
  problem: string;
  outcome: string;
  constraints: string;
}

function slugifyId(input: string): string {
  const s = (input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s || "agent";
}

function ensureModel(model: string | undefined): string {
  const m = (model ?? "").trim();
  if (!m) return "openai:gpt-5-mini";
  if (m.includes(":")) return m;
  return `openai:${m}`;
}

function dedupe<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function buildRuleBasedTopology(
  discovery: DiscoveryLike,
  team: TeamConfig
): TopologyDesign {
  const selected = selectIndustryTopologyTemplate(
    {
      problem: discovery.problem,
      outcome: discovery.outcome,
      constraints: discovery.constraints
    },
    team
  );
  const agents = dedupe(selected.agents);
  return {
    source: "rule",
    agents,
    lead_id: selected.leadId,
    links: selected.links.filter((l) => agents.some((a) => a.id === l.from) && agents.some((a) => a.id === l.to)),
    rationale: `rule-based topology template=${selected.templateId}; ${selected.rationale}`
  };
}

type AiTopologyPayload = {
  lead_id?: string;
  rationale?: string;
  agents?: Array<{
    id?: string;
    role?: string;
    risk_level?: string;
    model?: { primary?: string; fallback?: string[] };
    skills?: string[];
    mcps?: string[];
    input_contract?: string;
    output_contract?: string;
  }>;
  links?: Array<{
    from?: string;
    to?: string;
    trigger?: string;
    output?: string;
  }>;
};

export function parseAiTopology(
  text: string,
  fallback: TopologyDesign
): TopologyDesign {
  const raw = (text ?? "").trim();
  const parse = (): AiTopologyPayload | null => {
    try {
      return JSON.parse(raw) as AiTopologyPayload;
    } catch {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start < 0 || end <= start) return null;
      try {
        return JSON.parse(raw.slice(start, end + 1)) as AiTopologyPayload;
      } catch {
        return null;
      }
    }
  };

  const parsed = parse();
  if (!parsed || !Array.isArray(parsed.agents) || parsed.agents.length === 0) {
    return fallback;
  }

  const normalizedAgents = dedupe(
    parsed.agents
      .map((a) => {
        const id = slugifyId(String(a.id ?? ""));
        if (!id) return null;
        return {
          id,
          role: String(a.role ?? "Execution specialist"),
          risk_level: String(a.risk_level ?? "medium"),
          model: {
            primary: ensureModel(a.model?.primary),
            fallback: Array.isArray(a.model?.fallback) ? a.model?.fallback.map((x) => ensureModel(String(x))) : []
          },
          skills: Array.isArray(a.skills) ? a.skills.map((x) => String(x)) : [],
          mcps: Array.isArray(a.mcps) ? a.mcps.map((x) => String(x)) : [],
          input_contract: String(a.input_contract ?? "task_input"),
          output_contract: String(a.output_contract ?? `${id}_output`)
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
  );
  if (normalizedAgents.length === 0) {
    return fallback;
  }

  const agentIdSet = new Set(normalizedAgents.map((a) => a.id));
  const links: TopologyLink[] = Array.isArray(parsed.links)
    ? parsed.links
        .map((l) => ({
          from: slugifyId(String(l.from ?? "")),
          to: slugifyId(String(l.to ?? "")),
          trigger: String(l.trigger ?? "handoff"),
          output: String(l.output ?? "artifact")
        }))
        .filter((l) => agentIdSet.has(l.from) && agentIdSet.has(l.to))
    : [];
  const leadIdRaw = slugifyId(String(parsed.lead_id ?? ""));
  const leadId = agentIdSet.has(leadIdRaw) ? leadIdRaw : normalizedAgents[0].id;

  return {
    source: "ai",
    agents: normalizedAgents,
    lead_id: leadId,
    links: links.length > 0 ? links : fallback.links.filter((l) => agentIdSet.has(l.from) && agentIdSet.has(l.to)),
    rationale: String(parsed.rationale ?? "ai generated topology")
  };
}
