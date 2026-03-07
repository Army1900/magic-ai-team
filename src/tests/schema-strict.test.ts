import assert from "node:assert/strict";
import { defaultTeamTemplate } from "../core/templates";
import { validateTeamConfig } from "../core/validate";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run("validateTeamConfig warns in strict warn mode", () => {
  const team = defaultTeamTemplate("Strict Team", "Automate triage");
  team.control_plane.manager_agents[0].model = "gpt-5";
  const result = validateTeamConfig(team, "warn");
  assert.equal(result.valid, true);
  assert.equal(result.warnings.length > 0, true);
});

run("validateTeamConfig fails in strict fail mode", () => {
  const team = defaultTeamTemplate("Strict Team", "Automate triage");
  team.control_plane.manager_agents[0].model = "gpt-5";
  const result = validateTeamConfig(team, "fail");
  assert.equal(result.valid, false);
  assert.equal(result.errors.some((e) => e.includes("[strict]")), true);
});
