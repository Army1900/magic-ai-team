import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultTeamTemplate } from "../core/templates";
import { RunArtifact } from "../core/types";
import { feedbackScoreDelta, recordResourceAttachment, recordRunResourceFeedback } from "../core/resource-feedback";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run("resource feedback records run outcomes and increases score delta for good resources", () => {
  const prevHome = process.env.OPENTEAM_HOME;
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "openteam-feedback-"));
  process.env.OPENTEAM_HOME = tmpHome;
  try {
    recordResourceAttachment([{ type: "skill", id: "support_ticket_classifier" }]);
    recordResourceAttachment([{ type: "mcp", id: "servicenow-mcp" }]);

    const team = defaultTeamTemplate("Support Team", "Automate support triage");
    team.execution_plane.agents[0].skills = ["support_ticket_classifier"];
    team.execution_plane.agents[0].mcps = ["servicenow-mcp"];
    team.execution_plane.agents[1].skills = ["support_ticket_classifier"];
    team.execution_plane.agents[1].mcps = ["servicenow-mcp"];

    const artifact: RunArtifact = {
      run_id: "run_feedback_1",
      created_at: new Date().toISOString(),
      mode: "run",
      task: "triage incoming tickets",
      team_id: team.team.id,
      success: true,
      totals: {
        latency_ms: 1000,
        estimated_tokens: 1200,
        estimated_cost_usd: 0.012
      },
      steps: [
        {
          agent_id: team.execution_plane.agents[0].id,
          model: "openai:gpt-5-mini",
          status: "ok",
          latency_ms: 400,
          estimated_tokens: 500,
          estimated_cost_usd: 0.005,
          output_preview: "done"
        },
        {
          agent_id: team.execution_plane.agents[1].id,
          model: "openai:gpt-5-mini",
          status: "ok",
          latency_ms: 600,
          estimated_tokens: 700,
          estimated_cost_usd: 0.007,
          output_preview: "done"
        }
      ]
    };
    recordRunResourceFeedback(team, artifact);

    assert.equal(feedbackScoreDelta("skill", "support_ticket_classifier") > 0, true);
    assert.equal(feedbackScoreDelta("mcp", "servicenow-mcp") > 0, true);
  } finally {
    if (prevHome === undefined) {
      delete process.env.OPENTEAM_HOME;
    } else {
      process.env.OPENTEAM_HOME = prevHome;
    }
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

