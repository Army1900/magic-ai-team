import assert from "node:assert/strict";
import { failurePayload, successPayload, toJsonString } from "../core/json-output";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run("successPayload injects success=true", () => {
  const payload = successPayload({ a: 1, b: "x" });
  assert.equal(payload.success, true);
  assert.equal(payload.a, 1);
  assert.equal(payload.b, "x");
});

run("failurePayload injects success=false", () => {
  const payload = failurePayload({ blocked_by: "policy" });
  assert.equal(payload.success, false);
  assert.equal(payload.blocked_by, "policy");
});

run("toJsonString uses stable pretty format", () => {
  const text = toJsonString({ success: true, value: 1 });
  assert.equal(text.includes("\n"), true);
  assert.equal(text.includes('"success": true'), true);
});

