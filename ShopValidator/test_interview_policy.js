const assert = require("node:assert/strict");
const { MAX_TURNS, MAX_ATTEMPTS_PER_FIELD, getRequiredFields, getAllowedFields, evaluateInterviewCompleteness, sanitizeAgentNextQuestion } = require("./interview-policy.js");

assert.equal(MAX_TURNS, 12);
assert.equal(MAX_ATTEMPTS_PER_FIELD, 1);
for (const stage of ["operating", "preopen", "growth"]) {
  assert.equal(getRequiredFields(stage).length, 6);
  assert.ok(getAllowedFields(stage).length <= 12);
}
const base = { stage: "operating", locationConfirmed: true, facts: {}, turns: [] };
assert.equal(evaluateInterviewCompleteness(base).nextQuestion.field, "monthlyRevenue");

// A recorded unknown is a finished answer; the next field is different.
const unknownRevenue = evaluateInterviewCompleteness({
  ...base,
  facts: { monthlyRevenue: { field: "monthlyRevenue", status: "unknown", value: null } },
  turns: [{ field: "monthlyRevenue" }]
});
assert.equal(unknownRevenue.nextQuestion.field, "variableCostRate");
assert.equal(unknownRevenue.retryable.length, 0);

const core = getRequiredFields("operating");
const allCore = Object.fromEntries(core.map((field) => [field, { field, status: "confirmed", value: field === "bottleneck" ? "客流" : 1 }]));
const afterCore = evaluateInterviewCompleteness({ ...base, facts: allCore, turns: core.map((field) => ({ field })) });
assert.equal(afterCore.complete, false);
assert.ok(["trafficMatch", "visibility", "avgTicket", "dailyOrders", "retention", "channelMix"].includes(afterCore.nextQuestion.field));

const twelve = evaluateInterviewCompleteness({ ...base, turns: Array.from({ length: 12 }, (_, index) => ({ field: `x${index}` })) });
assert.equal(twelve.complete, true);
assert.equal(twelve.reason, "MAX_TURNS");

const agentCannotSkip = sanitizeAgentNextQuestion({ field: "debt", text: "跳过" }, base);
assert.equal(agentCannotSkip.field, "monthlyRevenue");
assert.equal(agentCannotSkip.source, "program");
console.log("interview-policy 6–12 deterministic tests passed");
