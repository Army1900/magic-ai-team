import { Command } from "commander";
import {
  getProviderRuntimeInfo,
  listSupportedProviders,
  SupportedProvider,
  testProviderConnectivity
} from "../core/model-providers";
import { loadOpenTeamConfig } from "../core/config";
import { banner, error, info, kv, status } from "../core/ui";

function resolveProviders(input?: string): SupportedProvider[] {
  if (!input || input === "all") {
    return listSupportedProviders();
  }
  const value = input.toLowerCase();
  if (value === "openai" || value === "anthropic") {
    return [value];
  }
  throw new Error("Unsupported provider. Use one of: openai, anthropic, all");
}

export function registerProviderCommand(program: Command): void {
  const cmd = program.command("provider").description("Manage model provider connection settings");

  cmd
    .command("list")
    .description("Show resolved provider runtime settings")
    .option("--provider <name>", "openai|anthropic|all", "all")
    .option("--json", "json output mode", false)
    .action((options) => {
      try {
        const providers = resolveProviders(options.provider);
        const items = providers.map((p) => getProviderRuntimeInfo(p));
        if (options.json) {
          let currentProvider: string | undefined;
          try {
            currentProvider = loadOpenTeamConfig("openteam.yaml").current_provider;
          } catch {
            // ignore missing config
          }
          console.log(JSON.stringify({ current_provider: currentProvider ?? "openai", providers: items }, null, 2));
          return;
        }

        banner("Provider Runtime");
        try {
          kv("current_provider", loadOpenTeamConfig("openteam.yaml").current_provider ?? "openai");
        } catch {
          kv("current_provider", "openai");
        }
        for (const item of items) {
          info(`${item.provider}:`);
          kv("base_url", item.base_url);
          kv("api_key_env", item.api_key_env);
          kv("api_key_source", item.api_key_source);
          status(item.api_key_configured ? "ok" : "warn", "auth", item.api_key_configured ? "configured" : "missing");
        }
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
        process.exitCode = 1;
      }
    });

  cmd
    .command("test")
    .description("Test provider connectivity and auth")
    .option("--provider <name>", "openai|anthropic|all", "all")
    .option("--timeout-ms <ms>", "request timeout in milliseconds", "8000")
    .option("--json", "json output mode", false)
    .action(async (options) => {
      try {
        const providers = resolveProviders(options.provider);
        const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 8000);
        const results = await Promise.all(providers.map((p) => testProviderConnectivity(p, timeoutMs)));
        const hasFail = results.some((r) => !r.ok);

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: !hasFail,
                timeout_ms: timeoutMs,
                results
              },
              null,
              2
            )
          );
          if (hasFail) {
            process.exitCode = 1;
          }
          return;
        }

        banner("Provider Connectivity Test");
        kv("timeout_ms", timeoutMs);
        for (const item of results) {
          status(item.ok ? "ok" : "fail", item.provider, `${item.detail} (${item.endpoint})`);
        }
        if (hasFail) {
          process.exitCode = 1;
        }
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
        process.exitCode = 1;
      }
    });
}
