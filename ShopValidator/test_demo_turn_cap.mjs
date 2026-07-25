import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
const demo = app.match(/const DEMO_CASE = \{[\s\S]*?\r?\n\};\r?\n\r?\nfunction escapeHtml/);

assert.ok(demo, "DEMO_CASE must remain statically inspectable");
const turnCount = (demo[0].match(/^\s*\["[^"]+",/gm) || []).length;
assert.equal(turnCount, 12, "demo must contain exactly twelve interview turns");
assert.ok(app.includes("`${index + 1}/12`"), "demo progress must use the same twelve-turn cap");
assert.ok(app.includes("extractLocalFact(answer, {"), "silent demo turns must submit their own question identity");
assert.ok(app.includes("extractLocalFact(answer, prepared)"), "visible demo turns must submit their own question identity");

console.log("demo contract: exactly 12 turns and a matching X/12 progress label passed");
