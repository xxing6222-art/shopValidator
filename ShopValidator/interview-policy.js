(function attachInterviewPolicy(root, factory) {
  const policy = factory();
  if (typeof module === "object" && module.exports) module.exports = policy;
  root.InterviewPolicy = policy;
}(typeof globalThis !== "undefined" ? globalThis : window, function createInterviewPolicy() {
  // The interview is deliberately a small deterministic program.  A model may
  // extract facts, but it never decides what to ask or retries an answer.
  const MAX_TURNS = 12;
  const MAX_ATTEMPTS_PER_FIELD = 1;

  const FIELD_DEFINITIONS = Object.freeze({
    monthlyRevenue: ["最近一个完整月，营业额大约多少？"],
    variableCostRate: ["每收一百元，食材、包装和平台大约花多少？"],
    fixedCostTotal: ["房租、人工（含老板自己）、水电等每月固定支出一共多少？"],
    cashReserve: ["不借新钱，现在还能动用多少现金？"],
    debt: ["贷款、欠款和供应商账一共还有多少？"],
    bottleneck: ["现在最卡哪一件事：客流、成交、复购、成本，还是产能？"],
    avgTicket: ["顾客平均一单大约花多少钱？"],
    dailyOrders: ["普通工作日一天大约多少单？"],
    channelMix: ["堂食和外卖，哪个占得更多？"],
    trafficMatch: ["经过门口的人，和你的目标顾客匹配吗？"],
    visibility: ["路过的人能马上看懂你卖什么、多少钱吗？"],
    retention: ["最近十位顾客里，大约几位会再来？"],
    leaseRemaining: ["租约还剩多久，最早什么时候能退出？"],
    plannedCommitment: ["签约到开业，全部计划投入一共多少？"],
    trialSale: ["开店前做过真实收钱的试卖吗？"],
    targetCustomer: ["最常买单的是哪一类人？"],
    reversibleInvestment: ["下一步能否先小额测试，随时停下来？"],
    staffCapacity: ["不加人时，一天最多能稳定做多少单？"],
    growthBottleneck: ["订单再多时，最先卡住哪一步？"],
    rent: ["房租和物业每月多少钱？"],
    labor: ["员工工资社保每月一共多少钱？"],
    otherFixed: ["除房租人工外，每月固定花多少？"],
    exitCost: ["现在退出或解约，还要额外花多少钱？"]
  });

  const CORE_FIELDS = Object.freeze({
    operating: ["monthlyRevenue", "variableCostRate", "fixedCostTotal", "cashReserve", "debt", "bottleneck"],
    preopen: ["plannedCommitment", "cashReserve", "debt", "fixedCostTotal", "variableCostRate", "trialSale"],
    growth: ["monthlyRevenue", "variableCostRate", "fixedCostTotal", "cashReserve", "staffCapacity", "growthBottleneck"]
  });
  const OPTIONAL_FIELDS = Object.freeze({
    operating: ["avgTicket", "dailyOrders", "channelMix", "trafficMatch", "visibility", "retention"],
    preopen: ["targetCustomer", "trafficMatch", "visibility", "leaseRemaining", "exitCost", "reversibleInvestment"],
    growth: ["avgTicket", "dailyOrders", "channelMix", "retention", "trafficMatch", "reversibleInvestment"]
  });

  function normalizeStage(stage) {
    const value = String(stage || "").trim().toLowerCase();
    if (value === "preopen" || ["准备开店", "接店", "加盟"].some((item) => value.includes(item))) return "preopen";
    if (value === "growth" || ["增长", "扩大", "扩张"].some((item) => value.includes(item))) return "growth";
    return "operating";
  }
  function getRequiredFields(stage) { return [...CORE_FIELDS[normalizeStage(stage)]]; }
  function getOptionalFields(stage) { return [...OPTIONAL_FIELDS[normalizeStage(stage)]]; }
  function getAllowedFields(stage) { return [...new Set([...getRequiredFields(stage), ...getOptionalFields(stage)])]; }
  function factsByField(rawFacts) {
    if (Array.isArray(rawFacts)) return Object.fromEntries(rawFacts.filter(Boolean).map((fact) => [String(fact.field || fact.id || ""), fact]).filter(([field]) => field));
    return rawFacts && typeof rawFacts === "object" ? rawFacts : {};
  }
  // Unknown is a completed answer. It must never trigger a rephrased retry.
  function isAnsweredFact(fact) { return Boolean(fact && typeof fact === "object"); }
  function attemptCounts(turns = []) {
    return (Array.isArray(turns) ? turns : []).reduce((counts, turn) => {
      const field = String(turn?.field || "").trim();
      if (field) counts[field] = (counts[field] || 0) + 1;
      return counts;
    }, {});
  }
  function questionFor(field) {
    const text = FIELD_DEFINITIONS[field]?.[0];
    return text ? { field, id: field, text, complete: false, attempt: 1 } : null;
  }
  function needsOptional(state, facts, counts) {
    const stage = normalizeStage(state.stage);
    const core = getRequiredFields(stage);
    // If a core financial fact is unknown, more questions create noise rather
    // than evidence. End and surface the missing evidence in the result.
    if (core.some((field) => !facts[field] || facts[field].status === "unknown")) return [];
    const signal = String(facts.bottleneck?.value || facts.growthBottleneck?.value || "").toLowerCase();
    const candidates = getOptionalFields(stage);
    const preferred = signal.includes("客") || signal.includes("流") || signal.includes("进")
      ? ["trafficMatch", "visibility", "avgTicket", "dailyOrders", "retention", "channelMix"]
      : signal.includes("复")
        ? ["retention", "avgTicket", "channelMix", "dailyOrders", "trafficMatch", "visibility"]
        : candidates;
    return preferred.filter((field) => !counts[field] && !isAnsweredFact(facts[field]));
  }
  function evaluateInterviewCompleteness(state = {}) {
    const stage = normalizeStage(state.stage);
    const facts = factsByField(state.facts);
    const counts = attemptCounts(state.turns);
    const totalTurns = Array.isArray(state.turns) ? state.turns.length : 0;
    const core = getRequiredFields(stage);
    const answeredCore = core.filter((field) => counts[field] > 0 || isAnsweredFact(facts[field]));
    const unansweredCore = core.filter((field) => !counts[field] && !isAnsweredFact(facts[field]));
    const base = {
      stage, requiredFields: core, optionalFields: getOptionalFields(stage), answeredCore,
      missing: unansweredCore, retryable: [], exhausted: [],
      asked: totalTurns, coreTarget: 6, maxTurns: MAX_TURNS,
      remainingTurns: Math.max(0, MAX_TURNS - totalTurns)
    };
    if (state.locationConfirmed !== true) return { ...base, complete: false, reason: "LOCATION_REQUIRED", nextQuestion: null };
    if (totalTurns >= MAX_TURNS) return { ...base, complete: true, reason: "MAX_TURNS", nextQuestion: null };
    if (unansweredCore.length) return { ...base, complete: false, reason: "CORE_FACTS", nextQuestion: questionFor(unansweredCore[0]) };
    const optional = needsOptional(state, facts, counts);
    // At most three useful follow-ups by default. The remaining capacity is a
    // hard safety ceiling for future policy additions, not a target.
    const optionalAsked = totalTurns - core.length;
    if (optional.length && optionalAsked < 3) return { ...base, complete: false, reason: "ADAPTIVE_EVIDENCE", nextQuestion: questionFor(optional[0]) };
    return { ...base, complete: true, reason: "CORE_COMPLETE", nextQuestion: null };
  }
  function isResolvedFact(fact) { return isAnsweredFact(fact) && fact.status !== "unknown" && fact.status !== "conflict"; }
  function isShortSingleQuestion(text) { return Boolean(String(text || "").trim()) && Array.from(String(text).trim()).length <= 36 && !/[\r\n]/.test(text); }
  function sanitizeAgentNextQuestion(_proposal, state = {}) {
    const program = evaluateInterviewCompleteness(state);
    return program.complete ? { field: "", text: "", complete: true, source: "program", progress: program } : { ...program.nextQuestion, source: "program", progress: program };
  }
  return { MAX_TURNS, MAX_ATTEMPTS_PER_FIELD, FIELD_DEFINITIONS, CORE_FIELDS, OPTIONAL_FIELDS, normalizeStage, getRequiredFields, getOptionalFields, getAllowedFields, isResolvedFact, questionFor, evaluateInterviewCompleteness, isShortSingleQuestion, sanitizeAgentNextQuestion };
}));
