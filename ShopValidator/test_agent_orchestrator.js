import assert from "node:assert/strict";
import {
  createSearchState,
  finalizeAgentSearch,
  runAgentRound,
  runAgentSearch,
  orchestratorInternals
} from "./agent-orchestrator.js";

const context = {
  facts: {
    monthlyRevenue: { value: 100000, status: "confirmed" },
    cashReserve: { value: 50000, status: "confirmed" },
    trafficMatch: { value: "unknown", status: "unknown" }
  },
  decision: "TEST",
  title: "先验证客流断点",
  reason: "现场证据不足",
  metrics: { grossMargin: 0.55, runway: 5 },
  flags: { hasStaffCapacityEvidence: false }
};

let active = 0;
let maxActive = 0;
let generated = 0;
let evidenceChecks = 0;
let executionChecks = 0;
const progress = [];

const mockLlm = async (messages) => {
  active += 1;
  maxActive = Math.max(maxActive, active);
  await new Promise((resolve) => setTimeout(resolve, 2));
  const system = messages[0].content;
  let result;
  if (system.includes("方案搜索器")) {
    generated += 1;
    result = {
      domain: `机制${generated}`,
      bottleneck: `断点${generated}`,
      mechanism: `不同机制${generated}`,
      hypothesis: `假设${generated}可以被现场数据证伪`,
      evidence_refs: ["monthlyRevenue"],
      action: `执行低成本实验${generated}`,
      budget_cap: 100,
      duration_days: 3,
      metric: `指标${generated}`,
      success_line: "提高10%",
      stop_line: "三天无改善就停止",
      reversibility: "high",
      expected_effect: {},
      assumptions: [],
      contraindications: [],
      falsification: "复测没有改善"
    };
  } else if (messages[1].content.includes('"verifier":"evidence"')) {
    evidenceChecks += 1;
    result = {
      pass: true,
      criteria: {
        "事实引用真实": 90,
        "未把推断写成事实": 90,
        "击中第一断点": 88,
        "考虑替代解释": 86,
        "实验可证伪": 92,
        "不与现有方案同义": 91
      },
      reasons: ["已逐项核对事实引用、因果链和证伪条件"],
      fatal_errors: []
    };
  } else {
    executionChecks += 1;
    result = {
      pass: true,
      criteria: {
        "使用给定计算而非心算": 94,
        "预算安全": 95,
        "期限不超过现金寿命": 96,
        "人员合同场地可执行": 90,
        "方案可逆": 95,
        "有停止线": 95,
        "无明显劳动隐私安全风险": 93
      },
      reasons: ["已用确定性数字核对预算、期限、可逆性和停止线"],
      fatal_errors: []
    };
  }
  active -= 1;
  return result;
};

const result = await runAgentSearch(context, {
  llm: mockLlm,
  concurrency: 3,
  target: 3,
  maxAttempts: 3,
  onProgress: (event) => progress.push(event)
});

assert.equal(createSearchState({ target: 999 }).target, 3);
assert.equal(createSearchState({ target: 999 }).maxAttempts, 3);
assert.equal(result.mode, "stepfun-search");
assert.equal(result.generated, 3);
assert.equal(result.verified, 3);
assert.equal(result.top3.length, 3);
assert.equal(generated, 3);
assert.equal(evidenceChecks, 3);
assert.equal(executionChecks, 3);
assert.ok(maxActive <= 3, `并发数不应超过3，实际为${maxActive}`);
assert.ok(result.top3[0].score > 0);
assert.equal(result.audited.length, 3);
assert.ok(result.audited.every((item) => item.verification.evidence && item.verification.execution));
assert.equal(result.degraded, false);
for (let round = 1; round <= 1; round += 1) {
  const phases = progress.filter((event) => event.round === round).map((event) => event.phase);
  assert.deepEqual(phases, ["generate", "verify-evidence", "verify-execution", "round-complete"]);
}

const mapAsTraffic = orchestratorInternals.normalizeCandidate({
  bottleneck: "客流少",
  mechanism: "附近学校证明人流很多",
  hypothesis: "POI等于客流",
  evidence_refs: ["location"],
  action: "立即投流",
  budget_cap: 100,
  duration_days: 3,
  metric: "订单",
  success_line: "增加",
  stop_line: "不增加停止",
  reversibility: "high",
  falsification: "订单不增加"
}, "bad-map");
assert.equal(orchestratorInternals.hardGate(mapAsTraffic, context).pass, false);

const unsafeFiring = orchestratorInternals.normalizeCandidate({
  bottleneck: "人员多",
  mechanism: "裁掉一个员工",
  hypothesis: "裁员会减少成本",
  evidence_refs: ["labor"],
  action: "开除员工",
  budget_cap: 0,
  duration_days: 1,
  metric: "工资",
  success_line: "下降",
  stop_line: "忙不过来停止",
  reversibility: "low",
  falsification: "产能下降"
}, "bad-firing");
assert.equal(orchestratorInternals.hardGate(unsafeFiring, context).pass, false);

const fallback = await runAgentSearch(context, { llm: null });
assert.equal(fallback.mode, "deterministic-fallback");
assert.equal(fallback.top3.length, 0);
assert.equal(fallback.evidence_tasks.length, 5);
assert.ok(fallback.evidence_tasks.every((item) => item.score === undefined));

const evidenceFallback = await runAgentSearch(
  { ...context, decision: "EVIDENCE" },
  { llm: null }
);
assert.equal(evidenceFallback.top3.length, 0);
assert.equal(evidenceFallback.evidence_tasks.length, 3);
assert.deepEqual(
  evidenceFallback.evidence_tasks.map((item) => item.domain),
  ["财务证据", "现金安全证据", "位置与现场漏斗证据"]
);
assert.ok(evidenceFallback.evidence_tasks.every(
  (item) => item.origin === "deterministic-minimum-evidence"
));
assert.ok(evidenceFallback.evidence_tasks.every(
  (item) => !/优化菜单|精简菜单|改门头|门头版本/.test(`${item.action} ${item.mechanism}`)
));
assert.ok(evidenceFallback.evidence_tasks.every((item) => item.budget_cap === 0));

let persisted = createSearchState();
persisted = await runAgentRound(context, persisted, { llm: mockLlm, concurrency: 3 });
assert.equal(persisted.round, 1);
assert.equal(persisted.audited.length, 3);
assert.equal(finalizeAgentSearch(context, persisted).top3.length, 3);

const validRaw = {
  domain: "现金",
  bottleneck: "实验预算过高",
  mechanism: "先做低成本预售",
  hypothesis: "小额预售可以检验真实购买意愿",
  evidence_refs: ["cashReserve"],
  action: "用一天时间发出二十份预售邀请",
  budget_cap: 100,
  duration_days: 2,
  metric: "付费预售人数",
  success_line: "至少五人付费",
  stop_line: "少于两人立即停止",
  reversibility: "high",
  expected_effect: { spend: 100 },
  assumptions: ["可以触达老顾客"],
  contraindications: [],
  falsification: "没有人愿意付费"
};

assert.equal(orchestratorInternals.validateRawCandidate(validRaw).pass, true);
assert.equal(orchestratorInternals.validateRawCandidate({ ...validRaw, budget_cap: undefined }).pass, false);
assert.equal(orchestratorInternals.validateRawCandidate({ ...validRaw, duration_days: undefined }).pass, false);
assert.equal(orchestratorInternals.validateRawCandidate({ ...validRaw, budget_cap: "100" }).pass, false);
assert.equal(orchestratorInternals.normalizeCandidate({ ...validRaw, budget_cap: null }, "invalid").budget_cap, null);
assert.equal(orchestratorInternals.normalizeCandidate({ ...validRaw, duration_days: "" }, "invalid").duration_days, null);
assert.equal(orchestratorInternals.finite(null), null);
assert.equal(orchestratorInternals.finite(""), null);
assert.equal(orchestratorInternals.finite("  "), null);

const emptyVerifier = orchestratorInternals.normalizeVerification({ pass: true }, "evidence");
assert.equal(emptyVerifier.pass, false);
assert.ok(emptyVerifier.fatal_errors.length > 0);

const missingReference = orchestratorInternals.normalizeCandidate({
  ...validRaw,
  evidence_refs: ["madeUpFact"]
}, "missing-reference");
const missingReferenceGate = orchestratorInternals.hardGate(missingReference, context);
assert.equal(missingReferenceGate.pass, false);
assert.ok(missingReferenceGate.reasons.some((reason) => reason.includes("事实引用不存在")));

const rangedCashContext = {
  ...context,
  facts: {
    ...context.facts,
    cashReserve: { value: null, range: { min: 10000, max: 50000 }, status: "confirmed" }
  }
};
assert.equal(orchestratorInternals.factRangeLowerBound(rangedCashContext.facts.cashReserve), 10000);
const unsafeAgainstCashFloor = orchestratorInternals.normalizeCandidate({
  ...validRaw,
  budget_cap: 2500,
  expected_effect: { spend: 2500 }
}, "unsafe-cash");
const cashGate = orchestratorInternals.hardGate(unsafeAgainstCashFloor, rangedCashContext);
assert.equal(cashGate.pass, false);
assert.ok(cashGate.reasons.some((reason) => reason.includes("保守现金储备下界")));

const shortRunwayGate = orchestratorInternals.hardGate(
  orchestratorInternals.normalizeCandidate(validRaw, "too-long"),
  { ...context, metrics: { ...context.metrics, runway: 0.03 } }
);
assert.equal(shortRunwayGate.pass, false);
assert.ok(shortRunwayGate.reasons.some((reason) => reason.includes("实验期限超过现金寿命")));

const inconsistentExpectedEffect = orchestratorInternals.normalizeCandidate({
  ...validRaw,
  budget_cap: 500,
  expected_effect: {
    spend: 600,
    revenue_delta: 1000,
    cost_delta: 300,
    profit_delta: 50
  }
}, "bad-effect");
const effectGate = orchestratorInternals.hardGate(inconsistentExpectedEffect, context);
assert.equal(effectGate.pass, false);
assert.ok(effectGate.reasons.some((reason) => reason.includes("超过预算上限")));
assert.ok(effectGate.reasons.some((reason) => reason.includes("算术不一致")));

let rejectionCalls = 0;
const emptyPassLlm = async (messages) => {
  if (messages[0].content.includes("方案搜索器")) {
    rejectionCalls += 1;
    return {
      ...validRaw,
      domain: `核验失败机制${rejectionCalls}`,
      bottleneck: `待核验断点${rejectionCalls}`,
      mechanism: `待核验机制${rejectionCalls}`,
      metric: `待核验指标${rejectionCalls}`
    };
  }
  return { pass: true };
};
const noQualified = await runAgentSearch(context, {
  llm: emptyPassLlm,
  concurrency: 3,
  target: 5,
  maxAttempts: 5
});
assert.equal(noQualified.requested, 3);
assert.equal(noQualified.generated, 3);
assert.equal(noQualified.verified, 0);
assert.deepEqual(noQualified.top3, []);
assert.equal(noQualified.evidence_tasks.length, 5);
assert.ok(noQualified.audited.every((item) => item.pass === false));

const duplicateBase = {
  ...orchestratorInternals.normalizeCandidate(validRaw, "dedupe-1"),
  score: 90,
  verification: {}
};
const dedupeResult = finalizeAgentSearch(context, {
  target: 3,
  audited: [],
  rejected: [],
  verified: [
    duplicateBase,
    { ...duplicateBase, id: "dedupe-2", score: 89 },
    {
      ...duplicateBase,
      id: "dedupe-3",
      metric: "复购率",
      success_line: "复购率提高五个百分点",
      score: 88
    }
  ]
});
assert.equal(dedupeResult.top3.length, 2);
assert.equal(dedupeResult.evidence_tasks.length, 0);

let degradedActive = 0;
let degradedMaxActive = 0;
let degradedGenerationCalls = 0;
let degradedVerifierCalls = 0;
const malformedLlm = async (messages) => {
  degradedActive += 1;
  degradedMaxActive = Math.max(degradedMaxActive, degradedActive);
  await new Promise((resolve) => setTimeout(resolve, 2));
  let response;
  if (messages[0].content.includes("方案搜索器")) {
    degradedGenerationCalls += 1;
    response = { idea: "缺少正式结构的模型输出" };
  } else {
    degradedVerifierCalls += 1;
    response = { pass: true };
  }
  degradedActive -= 1;
  return response;
};
const degradedResult = await runAgentSearch(context, {
  llm: malformedLlm,
  concurrency: 3,
  target: 3,
  maxAttempts: 3
});
assert.equal(degradedGenerationCalls, 3);
assert.equal(degradedVerifierCalls, 6);
assert.equal(degradedResult.generated, 3);
assert.equal(degradedResult.audited.length, 3);
assert.equal(new Set(degradedResult.audited.map((item) => orchestratorInternals.signature(item.candidate))).size, 3);
assert.equal(degradedResult.top3.length, 3);
assert.equal(degradedResult.degraded, true);
assert.ok(degradedResult.degradations.length >= 3);
assert.ok(degradedResult.audited.every((item) => item.candidate.origin === "deterministic-safety-backfill"));
assert.ok(degradedResult.audited.every((item) => item.verification.evidence.degraded));
assert.ok(degradedResult.audited.every((item) => item.verification.execution.degraded));
assert.ok(degradedResult.top3.every((item) => item.score <= 65));
assert.ok(degradedResult.top3.every((item) => item.degradations.length >= 2));
assert.ok(degradedMaxActive <= 3, `降级路径并发数不应超过3，实际为${degradedMaxActive}`);

console.log("agent orchestrator: strict schemas, one round, 3 generators + 6 verifiers, concurrency <= 3");
