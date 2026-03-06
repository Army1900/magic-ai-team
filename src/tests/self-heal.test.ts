import assert from "node:assert/strict";
import { suggestFixes } from "../core/self-heal";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run("suggestFixes returns launcher advice for missing tool", () => {
  const fixes = suggestFixes("Tool command not found: claude");
  assert.equal(fixes.some((f) => f.includes("launcher check")), true);
});

run("suggestFixes returns stdin-run advice for unsupported run injection", () => {
  const fixes = suggestFixes("Target 'continue' does not support stdin run injection.");
  assert.equal(fixes.some((f) => f.includes("without `--run`")), true);
});

run("suggestFixes provides fallback doctor advice", () => {
  const fixes = suggestFixes("unmapped error");
  assert.equal(fixes[0].includes("openteam doctor"), true);
});

run("suggestFixes returns launcher args-template advice", () => {
  const fixes = suggestFixes("args run strategy requires launchers.continue.run.args_template in openteam.yaml");
  assert.equal(fixes.some((f) => f.includes("args template")), true);
});
