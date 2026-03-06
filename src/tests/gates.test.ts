import assert from "node:assert/strict";
import { assessGateFindings } from "../core/gates";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run("assessGateFindings groups fail and warn", () => {
  const result = assessGateFindings(
    [
      { severity: "fail" as const, code: "A" },
      { severity: "warn" as const, code: "B" },
      { severity: "warn" as const, code: "C" }
    ],
    false
  );
  assert.equal(result.fails.length, 1);
  assert.equal(result.warns.length, 2);
  assert.equal(result.blocked, true);
});

run("assessGateFindings blocks on strict warnings", () => {
  const strictResult = assessGateFindings([{ severity: "warn" as const, code: "W" }], true);
  const nonStrictResult = assessGateFindings([{ severity: "warn" as const, code: "W" }], false);
  assert.equal(strictResult.blocked, true);
  assert.equal(nonStrictResult.blocked, false);
});

run("assessGateFindings passes when no findings", () => {
  const result = assessGateFindings([], true);
  assert.equal(result.fails.length, 0);
  assert.equal(result.warns.length, 0);
  assert.equal(result.blocked, false);
});

