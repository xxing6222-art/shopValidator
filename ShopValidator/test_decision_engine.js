const assert = require("node:assert/strict");
const {
  assess,
  assessServerCase,
  toServerDeterministicResult
} = require("./decision-engine.js");

const common = {
  category: "快餐",
  locationConfirmed: true,
  mapContextLoaded: true,
  variableCostRate: 45,
  rent: 12000,
  labor: 26000,
  otherFixed: 8000,
  cashReserve: 100000,
  avgTicket: 40,
  plannedCommitment: 0,
  debt: 0,
  trafficMatch: "yes",
  visibility: "yes",
  retention: "yes",
  known: {
    monthlyRevenue: true,
    variableCostRate: true,
    rent: true,
    labor: true,
    otherFixed: true,
    cashReserve: true,
    avgTicket: true,
    plannedCommitment: true,
    debt: true
  }
};

const profitable = assess({ ...common, stage: "operating", monthlyRevenue: 120000 });
assert.equal(profitable.decision, "GO");
assert.ok(profitable.metrics.monthlyProfit > 0);

const emergency = assess({ ...common, stage: "operating", monthlyRevenue: 50000, cashReserve: 20000 });
assert.equal(emergency.decision, "EXIT");
assert.ok(emergency.metrics.runway < 3);

const preopen = assess({
  ...common,
  stage: "preopen",
  monthlyRevenue: 0,
  plannedCommitment: 300000,
  cashReserve: 100000
});
assert.equal(preopen.decision, "STOP");
assert.equal(preopen.metrics.commitmentRatio, 3);

const missing = assess({
  ...common,
  stage: "operating",
  monthlyRevenue: 120000,
  locationConfirmed: false,
  known: {}
});
assert.equal(missing.decision, "EVIDENCE");

const noFixedCost = assess({
  ...common,
  stage: "operating",
  monthlyRevenue: 10000,
  rent: 0,
  labor: 0,
  otherFixed: 0
});
assert.equal(noFixedCost.decision, "GO");
assert.equal(noFixedCost.metrics.coverage, Infinity);

const blankIsNotZero = assess({
  ...common,
  stage: "operating",
  monthlyRevenue: 0,
  known: { ...common.known, monthlyRevenue: false }
});
assert.equal(blankIsNotZero.decision, "EVIDENCE");
assert.equal(blankIsNotZero.metrics.monthlyProfit, null);
assert.equal(blankIsNotZero.metrics.availability.monthlyProfit, "unavailable");
assert.ok(blankIsNotZero.evidence.missingFacts.includes("monthlyRevenue"));

const explicitZeroIsKnown = assess({
  ...common,
  stage: "operating",
  monthlyRevenue: 10000,
  rent: 0,
  labor: 0,
  otherFixed: 0,
  debt: 0,
  known: {
    ...common.known,
    rent: true,
    labor: true,
    otherFixed: true,
    debt: true
  }
});
assert.equal(explicitZeroIsKnown.metrics.fixedCosts, 0);
assert.equal(explicitZeroIsKnown.metrics.commitmentRatio, 0);

const factInputs = [
  ["monthlyRevenue", 120000, "CNY", "month"],
  ["variableCostRate", 45, "%", "sale"],
  ["rent", 12000, "CNY", "month"],
  ["labor", 26000, "CNY", "month"],
  ["ownerReplacementWage", 0, "CNY", "month"],
  ["otherFixed", 8000, "CNY", "month"],
  ["cashReserve", 100000, "CNY", "current"],
  ["avgTicket", 40, "CNY", "order"],
  ["debt", 0, "CNY", "current"]
].map(([field, value, unit, period]) => ({
  field,
  value,
  unit,
  period,
  status: "confirmed",
  source: "choice",
  evidenceGrade: "B"
}));

const factAssessment = assess({
  facts: factInputs,
  stage: "operating",
  category: "快餐",
  locationConfirmed: true,
  mapContextLoaded: true,
  trafficMatch: "yes",
  visibility: "yes",
  retention: "yes"
});
assert.equal(factAssessment.decision, "GO");
assert.equal(factAssessment.evidence.ready, true);
assert.equal(factAssessment.metrics.fixedCosts, 46000);

const unknownDebtAssessment = assess({
  facts: factInputs.map((fact) => fact.field === "debt"
    ? { ...fact, value: undefined, status: "unknown", evidenceGrade: "U" }
    : fact),
  stage: "operating",
  category: "快餐",
  locationConfirmed: true,
  mapContextLoaded: true,
  trafficMatch: "yes",
  visibility: "yes",
  retention: "yes"
});
assert.equal(unknownDebtAssessment.decision, "EVIDENCE");
assert.equal(unknownDebtAssessment.metrics.commitmentRatio, null);
assert.ok(unknownDebtAssessment.evidence.missingFacts.includes("debt"));

const rangedRevenueAssessment = assess({
  facts: factInputs.map((fact) => fact.field === "monthlyRevenue"
    ? { ...fact, value: undefined, range: { min: 100000, max: 120000 } }
    : fact),
  stage: "operating",
  category: "快餐",
  locationConfirmed: true,
  mapContextLoaded: true,
  trafficMatch: "yes",
  visibility: "yes",
  retention: "yes"
});
assert.equal(rangedRevenueAssessment.decision, "EVIDENCE");
assert.equal(rangedRevenueAssessment.metrics.monthlyProfit, null);
assert.ok(rangedRevenueAssessment.evidence.missingFacts.includes("monthlyRevenue"));

const assumedCostAssessment = assess({
  facts: factInputs.map((fact) => fact.field === "variableCostRate"
    ? { ...fact, status: "assumption", source: "calculation", evidenceGrade: "D" }
    : fact),
  stage: "operating",
  category: "快餐",
  locationConfirmed: true,
  mapContextLoaded: true,
  trafficMatch: "yes",
  visibility: "yes",
  retention: "yes"
});
assert.equal(assumedCostAssessment.decision, "EVIDENCE");
assert.equal(assumedCostAssessment.metrics.grossMargin, .55);
assert.equal(assumedCostAssessment.metrics.precision.grossMargin, "estimated");
assert.ok(assumedCostAssessment.evidence.unconfirmedFacts.includes("variableCostRate"));

const serverFacts = Object.fromEntries(factInputs.map((fact) => [fact.field, {
  id: fact.field,
  field: fact.field,
  value: fact.value,
  unit: fact.unit,
  period: fact.period,
  status: fact.status,
  source: fact.source,
  evidence: fact.evidenceGrade,
  transcript: `server:${fact.field}`
}]));
serverFacts.trafficMatch = {
  id: "trafficMatch",
  value: "yes",
  status: "confirmed",
  source: "choice",
  evidence: "B"
};
serverFacts.visibility = {
  id: "visibility",
  value: "yes",
  status: "confirmed",
  source: "choice",
  evidence: "B"
};
serverFacts.retention = {
  id: "retention",
  value: "yes",
  status: "confirmed",
  source: "choice",
  evidence: "B"
};
serverFacts.category = {
  id: "category",
  value: "快餐",
  status: "confirmed",
  source: "choice",
  evidence: "B"
};

const serverAssessment = assessServerCase({
  stage: "operating",
  location: { confirmed: true, context: { location: { address: "测试路1号" } } },
  facts: serverFacts,
  deterministicResult: {
    decision: "GO",
    title: "恶意客户端结果不应被读取",
    metrics: { monthlyProfit: 999999999 }
  }
});
assert.equal(serverAssessment.decision, "GO");
assert.equal(serverAssessment.metrics.monthlyProfit, 20000);
assert.notEqual(serverAssessment.title, "恶意客户端结果不应被读取");
assert.equal(serverAssessment.adapter.ignoredClientDecision, true);

const yearlyRentFacts = structuredClone(serverFacts);
yearlyRentFacts.rent.value = 144000;
yearlyRentFacts.rent.period = "year";
const yearlyRentResult = toServerDeterministicResult({
  stage: "operating",
  location: { confirmed: true, context: { location: { address: "测试路1号" } } },
  facts: yearlyRentFacts
});
assert.equal(yearlyRentResult.metrics.fixedCosts, 46000);

const unknownOwnerFacts = structuredClone(serverFacts);
unknownOwnerFacts.ownerReplacementWage = {
  id: "ownerReplacementWage",
  value: 0,
  status: "unknown",
  source: "choice",
  evidence: "U"
};
const unknownOwnerResult = assessServerCase({
  stage: "operating",
  location: { confirmed: true, context: { location: { address: "测试路1号" } } },
  facts: unknownOwnerFacts
});
assert.equal(unknownOwnerResult.decision, "EVIDENCE");
assert.equal(unknownOwnerResult.metrics.fixedCosts, null);
assert.equal(unknownOwnerResult.metrics.monthlyProfit, null);
assert.ok(unknownOwnerResult.evidence.missingFacts.includes("fixedCostTotal"));

const rangedServerFacts = structuredClone(serverFacts);
rangedServerFacts.monthlyRevenue = {
  id: "monthlyRevenue",
  range: { min: 100000, max: 120000 },
  period: "month",
  status: "confirmed",
  source: "choice",
  evidence: "B"
};
const rangedServerResult = assessServerCase({
  stage: "operating",
  location: { confirmed: true, context: { location: { address: "测试路1号" } } },
  facts: rangedServerFacts
});
assert.equal(rangedServerResult.decision, "EVIDENCE");
assert.equal(rangedServerResult.metrics.monthlyProfit, null);
assert.deepEqual(rangedServerResult.rangeBounds.rangedFields, ["monthlyRevenue"]);
assert.ok(Math.abs(
  rangedServerResult.rangeBounds.metrics.monthlyProfit.conservative - 9000
) < 1e-6);
assert.equal(rangedServerResult.rangeBounds.metrics.monthlyProfit.optimistic, 20000);

console.log("decision engine: 14 scenarios passed");
