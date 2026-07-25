import assert from "node:assert/strict";
import * as workerModule from "./worker.mjs";

for (const [name, value] of Object.entries(workerModule)) {
  if (name === "default") continue;
  assert.equal(
    typeof value,
    "function",
    `Worker named export "${name}" must be a function or class`
  );
}

console.log("worker export compatibility tests passed");
