import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EXPORT_TARGETS } from "../core/targets";
import { runUpFlow } from "../commands/up";
import { loadTeamConfig } from "../core/config";
import { evaluatePolicies } from "../core/policy";
import { assessGateFindings } from "../core/gates";
import { checkTargetCompatibility } from "../core/compatibility";
import { buildHandoffPackage, writeHandoffPackage } from "../core/handoff";
import { exportTeam, validateExportResult, writeExportManifest } from "../core/exporters";

function run(name: string, fn: () => void | Promise<void>): Promise<void> {
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

function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openteam-e2e-go-"));
  return fn(dir).finally(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

async function runTargetFlow(root: string, target: (typeof EXPORT_TARGETS)[number]): Promise<void> {
  const homeDir = path.join(root, "home");
  const project = path.join(root, "project", target);
  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(project, { recursive: true });
  const prevHome = process.env.OPENTEAM_HOME;
  process.env.OPENTEAM_HOME = homeDir;
  try {
    const up = await runUpFlow({
      name: `E2E-${target}`,
      goal: "Automate support triage",
      target,
      allowMock: true,
      nonInteractive: true,
      strict: false,
      silent: true
    });
    assert.equal(up.ok, true, `up failed target=${target}`);
    assert.equal(Boolean(up.team_file), true, `missing team file target=${target}`);

    const team = loadTeamConfig(String(up.team_file));
    const policyGate = assessGateFindings(evaluatePolicies(team).findings, false);
    assert.equal(policyGate.blocked, false, `policy blocked target=${target}`);

    const compatGate = assessGateFindings(checkTargetCompatibility(team, target).findings, false);
    assert.equal(compatGate.blocked, false, `compat blocked target=${target}`);

    const exported = exportTeam(team, target, project);
    const targetGate = assessGateFindings(validateExportResult(exported).findings, false);
    assert.equal(targetGate.blocked, false, `target validation blocked target=${target}`);

    const manifest = writeExportManifest(project, exported, String(up.team_file));
    const handoff = buildHandoffPackage(team, target);
    const handoffPaths = writeHandoffPackage(project, handoff);

    assert.equal(fs.existsSync(manifest), true, `manifest missing target=${target}`);
    assert.equal(fs.existsSync(handoffPaths.prompt), true, `handoff prompt missing target=${target}`);
  } finally {
    if (typeof prevHome === "undefined") {
      delete process.env.OPENTEAM_HOME;
    } else {
      process.env.OPENTEAM_HOME = prevHome;
    }
  }
}

void (async () => {
  await run("e2e go flow (no-start) works across all export targets", async () => {
    await withTempDir(async (root) => {
      for (const target of EXPORT_TARGETS) {
        await runTargetFlow(root, target);
      }
    });
  });
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
