import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getProviderRuntimeInfo, testProviderConnectivity } from "../core/model-providers";

function run(name: string, fn: () => Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`ok - ${name}`);
    })
    .catch((error) => {
      console.error(`not ok - ${name}`);
      throw error;
    });
}

function withTempCwd(fn: (cwd: string) => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openteam-provider-security-"));
  const prev = process.cwd();
  process.chdir(dir);
  return fn(dir).finally(() => {
    process.chdir(prev);
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

void run("inline api_key is blocked", async () => {
  await withTempCwd(async () => {
    const tempHome = path.join(process.cwd(), "home");
    const prevHome = process.env.OPENTEAM_HOME;
    process.env.OPENTEAM_HOME = tempHome;
    fs.mkdirSync(tempHome, { recursive: true });
    fs.writeFileSync(
      path.join(tempHome, "openteam.yaml"),
      [
        "version: \"1.0\"",
        "marketplaces: []",
        "resolution_policy:",
        "  source_priority: []",
        "  allow_ai_generated: true",
        "  min_trust_score: 0",
        "providers:",
        "  openai:",
        "    api_key: sk-test-inline",
        "    api_key_env: OPENAI_API_KEY"
      ].join("\n"),
      "utf8"
    );

    try {
      const info = getProviderRuntimeInfo("openai");
      assert.equal(info.api_key_source, "inline_blocked");
      assert.equal(info.api_key_configured, false);

      const connectivity = await testProviderConnectivity("openai", 1000);
      assert.equal(connectivity.ok, false);
      assert.equal(connectivity.detail.includes("not allowed"), true);
    } finally {
      if (typeof prevHome === "undefined") delete process.env.OPENTEAM_HOME;
      else process.env.OPENTEAM_HOME = prevHome;
    }
  });
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
