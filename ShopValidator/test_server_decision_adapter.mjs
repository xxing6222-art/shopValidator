import assert from "node:assert/strict";
import {
  INTERVIEW_LIMITS,
  computeServerDecision,
  evaluateInterviewCompleteness,
  getRequiredInterviewFields,
  sanitizeAgentNextQuestion
} from "./server-decision-adapter.mjs";

const serverCase = {
  stage: "operating",
  location: {
    confirmed: true,
    context: { location: { address: "测试路1号" } }
  },
  facts: {
    monthlyRevenue: { value: 120000, period: "month", status: "confirmed", evidence: "B" },
    variableCostRate: { value: 45, period: "sale", status: "confirmed", evidence: "B" },
    rent: { value: 12000, period: "month", status: "confirmed", evidence: "B" },
    labor: { value: 26000, period: "month", status: "confirmed", evidence: "B" },
    ownerReplacementWage: { value: 0, period: "month", status: "confirmed", evidence: "B" },
    otherFixed: { value: 8000, period: "month", status: "confirmed", evidence: "B" },
    cashReserve: { value: 100000, period: "current", status: "confirmed", evidence: "B" },
    avgTicket: { value: 40, period: "order", status: "confirmed", evidence: "B" },
    debt: { value: 0, period: "current", status: "confirmed", evidence: "B" },
    trafficMatch: { value: "yes", status: "confirmed", evidence: "B" },
    visibility: { value: "yes", status: "confirmed", evidence: "B" },
    retention: { value: "yes", status: "confirmed", evidence: "B" },
    category: { value: "快餐", status: "confirmed", evidence: "B" }
  }
};

const first = computeServerDecision(serverCase);
const second = computeServerDecision(structuredClone(serverCase));
assert.deepEqual(first, second);
assert.equal(first.decision, "GO");
assert.equal(first.metrics.monthlyProfit, 20000);

const stageFromFactCase = structuredClone(serverCase);
delete stageFromFactCase.stage;
stageFromFactCase.facts.stage = {
  value: "准备开店 / 接店",
  status: "confirmed",
  evidence: "B"
};
const stageFromFact = computeServerDecision(stageFromFactCase);
assert.equal(stageFromFact.decision, "EVIDENCE");
assert.ok(stageFromFact.evidence.missingFacts.includes("plannedCommitment"));

const required = getRequiredInterviewFields("preopen");
assert.ok(required.includes("plannedCommitment"));
assert.ok(required.includes("fixedCostTotal"));
assert.equal(INTERVIEW_LIMITS.maxTurns, 12);
assert.equal(INTERVIEW_LIMITS.maxAttemptsPerField, 1);

const interviewState = {
  stage: "preopen",
  locationConfirmed: true,
  facts: {},
  turns: []
};
const completeness = evaluateInterviewCompleteness(interviewState);
assert.equal(completeness.complete, false);
assert.equal(completeness.nextQuestion.field, "plannedCommitment");
assert.equal(
  sanitizeAgentNextQuestion({ complete: true }, interviewState).complete,
  false
);

console.log("server decision adapter: 5 scenarios passed");
