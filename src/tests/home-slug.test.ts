import assert from "node:assert/strict";
import { teamSlug } from "../core/home";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run("teamSlug falls back for non-ascii names", () => {
  const slug = teamSlug("智能汽车洗车在线下单平台");
  assert.equal(slug.startsWith("team-"), true);
  assert.equal(slug.length > 5, true);
});
