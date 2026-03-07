import assert from "node:assert/strict";
import { normalizeWorklogEvent } from "../core/worklog";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run("normalizeWorklogEvent strips non-finite numeric fields", () => {
  const out = normalizeWorklogEvent({
    type: "run",
    status: "ok",
    latency_ms: Number.NaN,
    cost_usd: Number.POSITIVE_INFINITY,
    tokens: 123
  });
  assert.equal(typeof out.ts, "string");
  assert.equal(out.latency_ms, undefined);
  assert.equal(out.cost_usd, undefined);
  assert.equal(out.tokens, 123);
});
