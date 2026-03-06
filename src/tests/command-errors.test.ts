import assert from "node:assert/strict";
import { reportCommandFailure, toErrorMessage } from "../core/command-errors";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run("toErrorMessage prefers Error.message", () => {
  assert.equal(toErrorMessage(new Error("boom")), "boom");
});

run("toErrorMessage stringifies unknown values", () => {
  assert.equal(toErrorMessage("x"), "x");
  assert.equal(toErrorMessage(42), "42");
});

run("reportCommandFailure prints error, optional hint, and sets exit code", () => {
  const errors: string[] = [];
  const infos: string[] = [];
  const prev = process.exitCode;
  try {
    reportCommandFailure({
      error: new Error("fail"),
      errorFn: (m) => errors.push(m),
      infoFn: (m) => infos.push(m),
      nextHint: "Next: retry",
      exitCode: 7
    });
    assert.deepEqual(errors, ["fail"]);
    assert.deepEqual(infos, ["Next: retry"]);
    assert.equal(process.exitCode, 7);
  } finally {
    process.exitCode = prev;
  }
});

