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

function withTempHome(fn: (home: string) => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openteam-up-force-"));
  const prev = process.env.OPENTEAM_HOME;
  process.env.OPENTEAM_HOME = dir;
  return fn(dir).finally(() => {
    if (typeof prev === "undefined") delete process.env.OPENTEAM_HOME;
    else process.env.OPENTEAM_HOME = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

void run("runUpFlow requires --force to overwrite existing team", async () => {
  await withTempHome(async () => {
    const base = {
      name: "Force Team",
      goal: "Automate support triage",
      target: "claude",
      allowMock: true,
      nonInteractive: true,
      strict: false,
      silent: true
    } as const;

    const first = await runUpFlow(base);
    assert.equal(first.ok, true);

    const second = await runUpFlow(base);
    assert.equal(second.ok, false);

    const third = await runUpFlow({ ...base, force: true });
    assert.equal(third.ok, true);
  });
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
