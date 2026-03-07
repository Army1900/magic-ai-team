import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runUpFlow } from "../commands/up";

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

void run("runUpFlow blocks without AI auth unless --allow-mock", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openteam-up-ai-required-"));
  const prevHome = process.env.OPENTEAM_HOME;
  const prevOpenai = process.env.OPENAI_API_KEY;
  const prevAnthropic = process.env.ANTHROPIC_API_KEY;
  process.env.OPENTEAM_HOME = dir;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const result = await runUpFlow({
      name: "AI Required",
      goal: "Automate support triage",
      target: "claude",
      nonInteractive: true,
      silent: true
    });
    assert.equal(result.ok, false);
  } finally {
    if (typeof prevHome === "undefined") delete process.env.OPENTEAM_HOME;
    else process.env.OPENTEAM_HOME = prevHome;
    if (typeof prevOpenai === "undefined") delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevOpenai;
    if (typeof prevAnthropic === "undefined") delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prevAnthropic;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
