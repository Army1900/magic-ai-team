import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ensureProgressTemplate,
  getProgressTemplatePath,
  readProgressTemplate,
  renderProgressReport
} from "../core/progress-template";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function withTempDir(fn: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openteam-progress-template-"));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

run("ensureProgressTemplate creates default template file", () => {
  withTempDir((dir) => {
    const filePath = ensureProgressTemplate(dir);
    assert.equal(fs.existsSync(filePath), true);
    const content = fs.readFileSync(filePath, "utf8");
    assert.equal(content.includes("## Overall Plan"), true);
  });
});

run("getProgressTemplatePath points to .openteam/templates/progress-report.md", () => {
  withTempDir((dir) => {
    const filePath = getProgressTemplatePath(dir).replace(/\\/g, "/");
    assert.equal(filePath.endsWith("/.openteam/templates/progress-report.md"), true);
  });
});

run("renderProgressReport replaces placeholders", () => {
  const rendered = renderProgressReport("Team={{team}} Total={{total_events}}", {
    generated_at: "t",
    project: "p",
    since: "24h",
    team: "A",
    total_events: 3,
    status_summary: "ok=1",
    type_breakdown: "- run: 1",
    overall_plan: "- step",
    agent_completed: "- done",
    progress: "moving",
    todo: "- next"
  });
  assert.equal(rendered, "Team=A Total=3");
});

run("readProgressTemplate returns template content", () => {
  withTempDir((dir) => {
    const content = readProgressTemplate(dir);
    assert.equal(content.includes("## TODO Next"), true);
  });
});

