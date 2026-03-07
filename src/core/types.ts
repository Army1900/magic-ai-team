export interface TeamKpi {
  name: string;
  target: string;
}

export interface ModelConfig {
  primary: string;
  fallback?: string[];
}

export interface ManagerAgent {
  id: string;
  type: "planner" | "broker" | "evaluator" | "optimizer" | "policy_guard" | string;
  model: string;
}

export interface ExecutionAgent {
  id: string;
  role: string;
  risk_level?: "low" | "medium" | "high" | string;
  model: ModelConfig;
  skills: string[];
  mcps: string[];
  input_contract: string;
  output_contract: string;
}

export interface SkillResource {
  id: string;
  source: string;
  version: string;
  license?: string;
  trust_score?: number;
  risk_level?: "low" | "medium" | "high" | string;
}

export interface McpResource {
  id: string;
  source: string;
  version: string;
  auth?: string;
  permissions?: string[];
  risk_level?: "low" | "medium" | "high" | string;
}

export interface TeamConfig {
  version: string;
  team: {
    id: string;
    name: string;
    goal: string;
    kpis: TeamKpi[];
  };
  context_docs?: string[];
  control_plane: {
    enabled: boolean;
    manager_agents: ManagerAgent[];
  };
  execution_plane: {
    agents: ExecutionAgent[];
  };
  resources: {
    skills: SkillResource[];
    mcps: McpResource[];
  };
  policies: {
    budget: {
      max_cost_usd_per_run: number;
    };
    latency: {
      p95_ms_max: number;
    };
    security: {
      allow_high_risk_mcp: boolean;
      allow_high_risk_skill: boolean;
      allow_high_risk_agent: boolean;
      require_human_approval_for_prod: boolean;
      min_skill_trust_score: number;
    };
  };
  observability: {
    trace: boolean;
    log_level: string;
    store: {
      runs_dir: string;
      reports_dir: string;
    };
  };
  optimization: {
    auto_optimize: boolean;
    strategy_order: string[];
  };
  fallback: {
    on_model_error: string;
    on_mcp_error: string;
    on_budget_exceed: string;
  };
}

export interface OpenTeamConfig {
  version: string;
  ui?: {
    theme?: string;
    color?: boolean;
  };
  current_provider?: "openai" | "anthropic" | string;
  providers?: {
    openai?: {
      base_url?: string;
      api_key_env?: string;
      models?: {
        default?: string;
        planner?: string;
        optimizer?: string;
        exporter_mapper?: string;
      };
    };
    anthropic?: {
      base_url?: string;
      api_key_env?: string;
      models?: {
        default?: string;
        planner?: string;
        optimizer?: string;
        exporter_mapper?: string;
      };
    };
  };
  marketplaces: Array<{
    id: string;
    kind: "official" | "github" | "private" | string;
    url: string;
    enabled: boolean;
  }>;
  resolution_policy: {
    source_priority: string[];
    allow_ai_generated: boolean;
    min_trust_score: number;
  };
  launchers?: Partial<{
    opencode: {
      run?: {
        mode?: "stdin" | "args" | "manual";
        args_template?: string[];
        manual_hint?: string;
      };
    };
    openclaw: {
      run?: {
        mode?: "stdin" | "args" | "manual";
        args_template?: string[];
        manual_hint?: string;
      };
    };
    claude: {
      run?: {
        mode?: "stdin" | "args" | "manual";
        args_template?: string[];
        manual_hint?: string;
      };
    };
    codex: {
      run?: {
        mode?: "stdin" | "args" | "manual";
        args_template?: string[];
        manual_hint?: string;
      };
    };
    aider: {
      run?: {
        mode?: "stdin" | "args" | "manual";
        args_template?: string[];
        manual_hint?: string;
      };
    };
    continue: {
      run?: {
        mode?: "stdin" | "args" | "manual";
        args_template?: string[];
        manual_hint?: string;
      };
    };
    cline: {
      run?: {
        mode?: "stdin" | "args" | "manual";
        args_template?: string[];
        manual_hint?: string;
      };
    };
    openhands: {
      run?: {
        mode?: "stdin" | "args" | "manual";
        args_template?: string[];
        manual_hint?: string;
      };
    };
    tabby: {
      run?: {
        mode?: "stdin" | "args" | "manual";
        args_template?: string[];
        manual_hint?: string;
      };
    };
  }>;
}

export interface AgentRunStep {
  agent_id: string;
  model: string;
  budget_action?: "none" | "downgraded";
  status: "ok" | "fail";
  latency_ms: number;
  estimated_tokens: number;
  estimated_cost_usd: number;
  output_preview: string;
}

export interface RunArtifact {
  run_id: string;
  created_at: string;
  mode: "run" | "simulate";
  task: string;
  team_id: string;
  success: boolean;
  totals: {
    latency_ms: number;
    estimated_tokens: number;
    estimated_cost_usd: number;
  };
  budget_monitor?: {
    budget_usd: number;
    warn_threshold_usd: number;
    alerts: string[];
    downgrade_actions: number;
  };
  steps: AgentRunStep[];
  failure_reason?: string;
}

export interface EvalReport {
  report_id: string;
  created_at: string;
  run_id: string;
  summary: {
    quality_score: number;
    reliability_score: number;
    cost_efficiency_score: number;
    overall_score: number;
  };
  observed: {
    success: boolean;
    total_latency_ms: number;
    total_cost_usd: number;
    total_tokens: number;
  };
  recommendations: string[];
}

export interface TeamVersionSnapshot {
  version_id: string;
  created_at: string;
  reason: string;
  source_run_id?: string;
  team_config: TeamConfig;
}

export interface OptimizationChange {
  type: "model_change" | "policy_change" | "topology_change";
  path: string;
  before: string;
  after: string;
}

export interface OptimizationResult {
  applied: boolean;
  reason: string;
  changes: OptimizationChange[];
}
