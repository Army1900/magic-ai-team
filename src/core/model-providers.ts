import { loadOpenTeamConfig } from "./config";

export interface ModelInvokeInput {
  model: string;
  prompt: string;
}

export interface ModelInvokeOutput {
  text: string;
  latency_ms: number;
  tokens: number;
  estimated_cost_usd: number;
}

function providerFromModel(model: string): string {
  return (model.split(":")[0] ?? "").toLowerCase();
}

export type SupportedProvider = "openai" | "anthropic";

interface ProviderRuntime {
  baseUrl: string;
  apiKey?: string;
  apiKeyEnvName: string;
  apiKeySource: "env" | "missing" | "inline_blocked";
  securityError?: string;
}

export interface ProviderRuntimeInfo {
  provider: SupportedProvider;
  base_url: string;
  api_key_env: string;
  api_key_source: "env" | "missing" | "inline_blocked";
  api_key_configured: boolean;
}

export interface ProviderConnectivityResult {
  provider: SupportedProvider;
  endpoint: string;
  ok: boolean;
  status_code?: number;
  detail: string;
}

function normalizeBaseUrl(base: string): string {
  return base.replace(/\/+$/, "");
}

function anthropicMessagesUrl(baseUrl: string): string {
  return baseUrl.endsWith("/v1") ? `${baseUrl}/messages` : `${baseUrl}/v1/messages`;
}

function anthropicModelsUrl(baseUrl: string): string {
  return baseUrl.endsWith("/v1") ? `${baseUrl}/models` : `${baseUrl}/v1/models`;
}

function defaultApiKeyEnv(provider: SupportedProvider): string {
  if (provider === "openai") return "OPENAI_API_KEY";
  return "ANTHROPIC_API_KEY";
}

function defaultBaseUrl(provider: SupportedProvider): string {
  if (provider === "openai") return "https://api.openai.com/v1";
  return "https://api.anthropic.com";
}

function loadRuntimeConfig(provider: SupportedProvider): ProviderRuntime {
  const envBase =
    provider === "openai"
      ? process.env.OPENAI_BASE_URL
      : process.env.ANTHROPIC_BASE_URL;
  const envKeyDirect =
    provider === "openai"
      ? process.env.OPENAI_API_KEY
      : process.env.ANTHROPIC_API_KEY;

  let cfgProvider: { base_url?: string; api_key_env?: string } & Record<string, unknown> | undefined;
  try {
    const cfg = loadOpenTeamConfig();
    cfgProvider =
      provider === "openai"
        ? cfg.providers?.openai
        : cfg.providers?.anthropic;
  } catch {
    // ignore missing/invalid OpenTeam config and fallback to defaults
  }

  const apiKeyEnvName = cfgProvider?.api_key_env?.trim() || defaultApiKeyEnv(provider);
  const envByName = process.env[apiKeyEnvName];
  const inlineApiKey =
    typeof cfgProvider?.api_key === "string" && cfgProvider.api_key.trim().length > 0
      ? cfgProvider.api_key.trim()
      : "";
  const securityError = inlineApiKey
    ? `providers.${provider}.api_key is not allowed. Use ${apiKeyEnvName} (or providers.${provider}.api_key_env).`
    : undefined;
  const apiKey = securityError ? undefined : envByName || envKeyDirect;
  const apiKeySource = securityError
    ? "inline_blocked"
    : apiKey
      ? "env"
      : "missing";

  const baseUrl = normalizeBaseUrl(
    cfgProvider?.base_url?.trim() || envBase?.trim() || defaultBaseUrl(provider)
  );

  return {
    baseUrl,
    apiKey,
    apiKeyEnvName,
    apiKeySource,
    securityError
  };
}

export function listSupportedProviders(): SupportedProvider[] {
  return ["openai", "anthropic"];
}

export function getProviderRuntimeInfo(provider: SupportedProvider): ProviderRuntimeInfo {
  const runtime = loadRuntimeConfig(provider);
  return {
    provider,
    base_url: runtime.baseUrl,
    api_key_env: runtime.apiKeyEnvName,
    api_key_source: runtime.apiKeySource,
    api_key_configured: Boolean(runtime.apiKey)
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function testProviderConnectivity(
  provider: SupportedProvider,
  timeoutMs = 8000
): Promise<ProviderConnectivityResult> {
  const runtime = loadRuntimeConfig(provider);
  if (!runtime.apiKey) {
    return {
      provider,
      endpoint: provider === "openai" ? `${runtime.baseUrl}/models` : anthropicModelsUrl(runtime.baseUrl),
      ok: false,
      detail: runtime.securityError ?? `${runtime.apiKeyEnvName} missing`
    };
  }

  const endpoint = provider === "openai" ? `${runtime.baseUrl}/models` : anthropicMessagesUrl(runtime.baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    const openaiHeaders: Record<string, string> = {
      Authorization: `Bearer ${runtime.apiKey}`
    };
    const anthropicHeaders: Record<string, string> = {
      "x-api-key": runtime.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    };
    const res =
      provider === "openai"
        ? await fetch(endpoint, {
            method: "GET",
            headers: openaiHeaders,
            signal: controller.signal
          })
        : await fetch(endpoint, {
            method: "POST",
            headers: anthropicHeaders,
            signal: controller.signal,
            body: JSON.stringify({
              model: "claude-sonnet-4",
              max_tokens: 1,
              messages: [{ role: "user", content: "ping" }]
            })
          });
    const body = (await res.text()).slice(0, 180).replace(/\s+/g, " ").trim();
    if (res.ok) {
      return {
        provider,
        endpoint,
        ok: true,
        status_code: res.status,
        detail: `HTTP ${res.status}`
      };
    }
    if (provider === "anthropic" && (res.status === 404 || res.status === 405)) {
      const modelEndpoint = anthropicModelsUrl(runtime.baseUrl);
      const modelRes = await fetch(modelEndpoint, {
        method: "GET",
        headers: {
          "x-api-key": runtime.apiKey,
          "anthropic-version": "2023-06-01"
        },
        signal: controller.signal
      });
      const modelBody = (await modelRes.text()).slice(0, 180).replace(/\s+/g, " ").trim();
      if (modelRes.ok) {
        return {
          provider,
          endpoint: modelEndpoint,
          ok: true,
          status_code: modelRes.status,
          detail: `HTTP ${modelRes.status}`
        };
      }
      return {
        provider,
        endpoint: modelEndpoint,
        ok: false,
        status_code: modelRes.status,
        detail: `HTTP ${modelRes.status}${modelBody ? `: ${modelBody}` : ""}`
      };
    }
    const authHint =
      res.status === 401 || res.status === 403 ? " (auth failed, check key/base_url)" : "";
    return {
      provider,
      endpoint,
      ok: false,
      status_code: res.status,
      detail: `HTTP ${res.status}${authHint}${body ? `: ${body}` : ""}`
    };
  } catch (e) {
    return {
      provider,
      endpoint,
      ok: false,
      detail: `request error: ${errorMessage(e)}`
    };
  } finally {
    clearTimeout(timer);
  }
}

export function canInvokeLive(model: string): boolean {
  const provider = providerFromModel(model);
  if (provider !== "openai" && provider !== "anthropic") {
    return false;
  }
  const runtime = loadRuntimeConfig(provider);
  return Boolean(runtime.apiKey);
}

export function describeProviderAuth(model: string): { provider: string; ok: boolean; detail: string } {
  const provider = providerFromModel(model);
  if (provider !== "openai" && provider !== "anthropic") {
    return {
      provider,
      ok: false,
      detail: `No live provider adapter for model '${model}'`
    };
  }

  const runtime = loadRuntimeConfig(provider);
  if (!runtime.apiKey) {
    return {
      provider,
      ok: false,
      detail: runtime.securityError ?? `${runtime.apiKeyEnvName} missing`
    };
  }
  return {
    provider,
    ok: true,
    detail: `${runtime.apiKeyEnvName} present`
  };
}

function costPer1k(model: string): number {
  const m = model.toLowerCase();
  if (m.includes("gpt-5-mini")) return 0.002;
  if (m.includes("gpt-5")) return 0.01;
  return 0.006;
}

function mockInvoke(input: ModelInvokeInput): ModelInvokeOutput {
  const tokens = Math.max(120, Math.round(input.prompt.length / 3));
  const cost = Number(((tokens / 1000) * costPer1k(input.model)).toFixed(4));
  const latency = 220 + Math.min(1800, Math.round(input.prompt.length * 0.9));
  return {
    text: `mock:${input.model} => generated response`,
    latency_ms: latency,
    tokens,
    estimated_cost_usd: cost
  };
}

async function openAiInvoke(input: ModelInvokeInput): Promise<ModelInvokeOutput> {
  const runtime = loadRuntimeConfig("openai");
  const apiKey = runtime.apiKey;
  if (!apiKey) {
    throw new Error(runtime.securityError ?? `${runtime.apiKeyEnvName} is missing`);
  }

  const modelName = input.model.split(":")[1] ?? input.model;
  const started = Date.now();
  const res = await fetch(`${runtime.baseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      input: input.prompt,
      max_output_tokens: 256
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${body}`);
  }

  const data = (await res.json()) as {
    output_text?: string;
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  };

  const tokens = data.usage?.total_tokens ?? (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
  return {
    text: data.output_text ?? "",
    latency_ms: Date.now() - started,
    tokens,
    estimated_cost_usd: Number(((tokens / 1000) * costPer1k(input.model)).toFixed(4))
  };
}

async function anthropicInvoke(input: ModelInvokeInput): Promise<ModelInvokeOutput> {
  const runtime = loadRuntimeConfig("anthropic");
  const apiKey = runtime.apiKey;
  if (!apiKey) {
    throw new Error(runtime.securityError ?? `${runtime.apiKeyEnvName} is missing`);
  }

  const modelName = input.model.split(":")[1] ?? input.model;
  const started = Date.now();
  const res = await fetch(anthropicMessagesUrl(runtime.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: modelName,
      max_tokens: 256,
      messages: [{ role: "user", content: input.prompt }]
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error: ${res.status} ${body}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = (data.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("\n");
  const tokens = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);

  return {
    text,
    latency_ms: Date.now() - started,
    tokens,
    estimated_cost_usd: Number(((tokens / 1000) * costPer1k(input.model)).toFixed(4))
  };
}

export async function invokeModel(input: ModelInvokeInput, executionMode: "mock" | "live"): Promise<ModelInvokeOutput> {
  if (executionMode === "mock") {
    return mockInvoke(input);
  }

  const provider = providerFromModel(input.model);
  if (provider === "openai") {
    return openAiInvoke(input);
  }
  if (provider === "anthropic") {
    return anthropicInvoke(input);
  }

  throw new Error(`No live provider adapter for model '${input.model}'`);
}
