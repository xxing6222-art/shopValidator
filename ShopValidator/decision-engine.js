(function attachDecisionEngine(root, factory) {
  let factStore = root.FactStore;
  if (!factStore && typeof module === "object" && module.exports) {
    try {
      factStore = require("./fact-store.js");
    } catch (_) {
      factStore = null;
    }
  }
  const engine = factory(factStore);
  if (typeof module === "object" && module.exports) module.exports = engine;
  root.DecisionEngine = engine;
}(typeof globalThis !== "undefined" ? globalThis : window, function createDecisionEngine(FactStore) {
  const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const knownAnswer = (value) => value === "yes" || value === "no";
  const answerScore = (value) => value === "yes" ? 1 : value === "no" ? 0 : null;

  const FIELD_LABELS = Object.freeze({
    monthlyRevenue: "月营业额",
    variableCostRate: "每卖100元的变动成本",
    rent: "房租和物业",
    labor: "员工人工",
    ownerReplacementWage: "老板和家人的替代工资",
    otherFixed: "水电、推广等固定支出",
    cashReserve: "可用现金",
    avgTicket: "客单价",
    plannedCommitment: "计划投入",
    debt: "债务"
  });

  function prepareInput(rawInput = {}) {
    if (rawInput && rawInput.schemaVersion === 1 && rawInput.facts) {
      if (!FactStore) throw new Error("FactStore is required when assess receives a fact archive");
      return FactStore.toDecisionInput(rawInput);
    }
    if (rawInput && rawInput.facts) {
      if (!FactStore) throw new Error("FactStore is required when assess receives facts");
      const base = { ...rawInput };
      delete base.facts;
      return FactStore.toDecisionInput(rawInput.facts, base);
    }
    return { ...rawInput };
  }

  function normalizeInput(rawInput) {
    const known = rawInput.known && typeof rawInput.known === "object" ? rawInput.known : null;
    const factMode = rawInput._factMode === true;
    const declaredKnown = (key) => known
      ? known[key] === true
      : hasOwn(rawInput, key) && rawInput[key] !== "" && rawInput[key] != null;
    const number = (key, options = {}) => {
      if (!declaredKnown(key)) return null;
      const value = Number(rawInput[key]);
      if (!Number.isFinite(value)) return null;
      if (options.min != null && value < options.min) return null;
      if (options.max != null && value > options.max) return null;
      return value;
    };

    const normalized = {
      ...rawInput,
      _factMode: factMode,
      _factVersion: rawInput._factVersion ?? null,
      _factMeta: rawInput._factMeta || {},
      stage: rawInput.stage === "preopen" ? "preopen" : "operating",
      category: String(rawInput.category || "").trim(),
      locationConfirmed: rawInput.locationConfirmed === true,
      mapContextLoaded: rawInput.mapContextLoaded === true,
      trafficMatch: knownAnswer(rawInput.trafficMatch) ? rawInput.trafficMatch : "unknown",
      visibility: knownAnswer(rawInput.visibility) ? rawInput.visibility : "unknown",
      retention: knownAnswer(rawInput.retention) ? rawInput.retention : "unknown",
      monthlyRevenue: number("monthlyRevenue", { min: 0 }),
      variableCostRate: number("variableCostRate", { min: 1, max: 95 }),
      fixedCostTotal: number("fixedCostTotal", { min: 0 }),
      rent: number("rent", { min: 0 }),
      labor: number("labor", { min: 0 }),
      ownerReplacementWage: number("ownerReplacementWage", { min: 0 }),
      otherFixed: number("otherFixed", { min: 0 }),
      cashReserve: number("cashReserve", { min: 0 }),
      avgTicket: number("avgTicket", { min: Number.EPSILON }),
      plannedCommitment: number("plannedCommitment", { min: 0 }),
      debt: number("debt", { min: 0 }),
      known: known || {}
    };
    // Backward-compatible programmatic inputs may provide a cost breakdown;
    // the new interview stores one total so owners are not asked four times.
    if (normalized.fixedCostTotal === null && !factMode) {
      const parts = [normalized.rent, normalized.labor, normalized.otherFixed];
      if (parts.every((value) => value !== null)) {
        normalized.fixedCostTotal = parts.reduce((sum, value) => sum + value, 0) + (normalized.ownerReplacementWage || 0);
      }
    }
    return normalized;
  }

  function requiredNumericFields(input) {
    if (input.stage === "preopen") {
      return ["plannedCommitment", "cashReserve", "debt", "fixedCostTotal", "variableCostRate"];
    }
    return ["monthlyRevenue", "variableCostRate", "fixedCostTotal", "cashReserve", "debt"];
  }

  function factWeight(input, key) {
    if (!input._factMode) return input[key] !== null ? 1 : 0;
    const fact = input._factMeta[key];
    if (!fact || fact.status === "unknown" || fact.status === "conflict") return 0;
    const rangePenalty = fact.range ? .75 : 1;
    if (fact.status === "confirmed") return 1 * rangePenalty;
    if (fact.status === "provisional") return .65 * rangePenalty;
    if (fact.status === "assumption") return .25 * rangePenalty;
    return 0;
  }

  function evidenceCompleteness(input) {
    const required = requiredNumericFields(input);
    const numericScore = required.reduce((sum, key) => sum + factWeight(input, key), 0)
      / required.length * 52;
    const answerScoreValue = ["trafficMatch", "visibility", "retention"]
      .filter((key) => knownAnswer(input[key])).length / 3 * 24;
    const locationScore = input.locationConfirmed ? 14 : 0;
    const mapScore = input.mapContextLoaded ? 5 : 0;
    const categoryScore = input.category ? 5 : 0;
    return Math.round(clamp(
      numericScore + answerScoreValue + locationScore + mapScore + categoryScore,
      0,
      100
    ));
  }

  function criticalEvidenceIssues(input) {
    const missing = [];
    const unconfirmed = [];
    for (const key of requiredNumericFields(input)) {
      if (input[key] === null) {
        missing.push(key);
        continue;
      }
      if (input._factMode) {
        const fact = input._factMeta[key];
        if (!fact || fact.status !== "confirmed" || fact.range) unconfirmed.push(key);
      }
    }
    if (!input.locationConfirmed) missing.push("location");
    return { missing, unconfirmed };
  }

  function addIfKnown(values) {
    return values.every((value) => value !== null)
      ? values.reduce((sum, value) => sum + value, 0)
      : null;
  }

  function divide(numerator, denominator) {
    if (numerator === null || denominator === null) return null;
    if (denominator === 0) return numerator > 0 ? Infinity : 0;
    return numerator / denominator;
  }

  function calculateMetrics(input, completeness) {
    const grossMargin = input.variableCostRate === null
      ? null
      : 1 - input.variableCostRate / 100;
    const baseFixedCosts = input.fixedCostTotal !== null && input.fixedCostTotal !== undefined
      ? input.fixedCostTotal
      : addIfKnown([input.rent, input.labor, input.otherFixed]);
    const ownerLaborCost = input._factMode
      ? input.ownerReplacementWage
      : input.ownerReplacementWage ?? 0;
    const fixedCosts = input.fixedCostTotal !== null && input.fixedCostTotal !== undefined
      ? input.fixedCostTotal
      : baseFixedCosts === null || ownerLaborCost === null
        ? null
        : baseFixedCosts + ownerLaborCost;
    const breakEvenMonthly = grossMargin !== null && grossMargin > 0 && fixedCosts !== null
      ? fixedCosts / grossMargin
      : null;
    const breakEvenDaily = breakEvenMonthly === null ? null : breakEvenMonthly / 30;
    const breakEvenOrders = breakEvenDaily === null || input.avgTicket === null
      ? null
      : breakEvenDaily / input.avgTicket;
    const monthlyProfit = input.stage !== "operating" ||
      input.monthlyRevenue === null ||
      grossMargin === null ||
      fixedCosts === null
      ? null
      : input.monthlyRevenue * grossMargin - fixedCosts;
    const coverage = input.stage !== "operating" || input.monthlyRevenue === null
      ? null
      : breakEvenMonthly === null
        ? null
        : breakEvenMonthly > 0
          ? input.monthlyRevenue / breakEvenMonthly
          : input.monthlyRevenue > 0 ? Infinity : 1;
    const runway = monthlyProfit === null || input.cashReserve === null
      ? null
      : monthlyProfit < 0
        ? input.cashReserve / Math.abs(monthlyProfit)
        : Infinity;
    const commitmentNumerator = input.stage === "preopen"
      ? addIfKnown([input.plannedCommitment, input.debt])
      : input.debt;
    const commitmentRatio = divide(commitmentNumerator, input.cashReserve);
    const qualitativeValues = [
      answerScore(input.trafficMatch),
      answerScore(input.visibility),
      answerScore(input.retention)
    ].filter((value) => value !== null);
    const qualitative = qualitativeValues.length
      ? qualitativeValues.reduce((sum, value) => sum + value, 0) / qualitativeValues.length
      : null;

    const metricValues = {
      grossMargin,
      fixedCosts,
      breakEvenMonthly,
      breakEvenDaily,
      breakEvenOrders,
      monthlyProfit,
      coverage,
      runway,
      commitmentRatio,
      qualitative
    };
    const dependencies = {
      grossMargin: ["variableCostRate"],
      fixedCosts: ["fixedCostTotal"],
      breakEvenMonthly: ["variableCostRate", "fixedCostTotal"],
      breakEvenDaily: ["variableCostRate", "fixedCostTotal"],
      breakEvenOrders: ["variableCostRate", "fixedCostTotal", "avgTicket"],
      monthlyProfit: ["monthlyRevenue", "variableCostRate", "fixedCostTotal"],
      coverage: ["monthlyRevenue", "variableCostRate", "fixedCostTotal"],
      runway: ["monthlyRevenue", "variableCostRate", "fixedCostTotal", "cashReserve"],
      commitmentRatio: input.stage === "preopen"
        ? ["plannedCommitment", "debt", "cashReserve"]
        : ["debt", "cashReserve"],
      qualitative: []
    };
    const availability = Object.fromEntries(
      Object.entries(metricValues).map(([key, value]) => [
        key,
        value === null ? "unavailable" : "available"
      ])
    );
    const precision = Object.fromEntries(
      Object.entries(metricValues).map(([key, value]) => {
        if (value === null) return [key, "unavailable"];
        if (!input._factMode) return [key, "exact"];
        const estimated = (dependencies[key] || []).some((field) => {
          const fact = input._factMeta[field];
          return fact && fact.status !== "confirmed";
        });
        return [key, estimated ? "estimated" : "exact"];
      })
    );

    return {
      ...metricValues,
      completeness,
      availability,
      precision,
      unavailable: Object.entries(availability)
        .filter(([, status]) => status === "unavailable")
        .map(([key]) => key)
    };
  }

  function pickAction(input, metrics, issues) {
    if (!input.locationConfirmed) {
      return {
        action: "先到店铺现场定位，或者手动写下店铺的准确商圈。",
        stopLine: "没有具体位置，不判断客流，也不建议签约或追加投入。"
      };
    }
    if (issues.missing.length || issues.unconfirmed.length) {
      const first = issues.missing[0] || issues.unconfirmed[0];
      return {
        action: `先确认${FIELD_LABELS[first] || "关键经营数据"}，再重新算账。`,
        stopLine: "关键数字没有确认前，不把估算值当成利润、保本线或现金寿命。"
      };
    }
    if (input.trafficMatch === "unknown") {
      return {
        action: "午高峰和晚高峰各站 20 分钟：只数目标顾客经过、看见、进店和成交的人数。",
        stopLine: "两次测试都没有足够目标顾客经过，就停止为这个位置追加投入。"
      };
    }
    if (input.trafficMatch === "no") {
      return {
        action: "停止投流，先用摆摊、外卖或预售测试：目标顾客是否愿意为这个产品付钱。",
        stopLine: "如果换到目标顾客出现的地方仍无人购买，问题不在位置，而在产品。"
      };
    }
    if (input.visibility !== "yes") {
      return {
        action: "用 300 元以内做一个门头实验：让 5 个陌生人看 10 秒，说出卖什么、多少钱、为什么进店。",
        stopLine: "5 人中少于 4 人能说清，就先改门头和产品呈现，不追加装修或推广。"
      };
    }
    if (input.stage === "preopen") {
      return {
        action: `先完成 3 天真实销售测试，目标每天至少 ${Math.ceil(metrics.breakEvenOrders)} 单，再决定是否签约。`,
        stopLine: "测试没有达到保本订单的 70%，不把“以后会变好”当作签约依据。"
      };
    }
    if (input.retention !== "yes") {
      return {
        action: "联系最近 10 位真实顾客，只问两件事：为什么第一次来、为什么没有再来。",
        stopLine: "复购原因没有变清楚前，不通过打折和投流购买一次性营业额。"
      };
    }
    if (metrics.coverage < 1) {
      return {
        action: "只选一个变量做 7 天实验：提毛利、减班次、降固定成本或提高成交率，不要同时乱改。",
        stopLine: "7 天后保本缺口没有缩小至少 20%，停止该实验并进入缩店或退出预案。"
      };
    }
    return {
      action: "保持现有模型两周，只放大能带来重复毛利的渠道，并记录每一元新增支出的回报。",
      stopLine: "新增投入不能在约定周期内回收，就回到原有规模。"
    };
  }

  function determineDecision(input, metrics, issues) {
    if (
      metrics.completeness < 65 ||
      issues.missing.length ||
      issues.unconfirmed.length
    ) {
      return {
        decision: "EVIDENCE",
        title: "信息还不够，先别做决定",
        reason: "关键数字或现场证据缺失。现在给出肯定答案，只是在把猜测包装成专业。"
      };
    }

    if (input.stage === "preopen") {
      if (
        input.trafficMatch === "no" ||
        input.visibility === "no" ||
        metrics.commitmentRatio > 1
      ) {
        return {
          decision: "STOP",
          title: "先停止签约和付款",
          reason: "位置、可见性或资金安全垫没有过闸门。不要用整店投入替代真实测试。"
        };
      }
      return {
        decision: "TEST",
        title: "先试卖，再决定开不开",
        reason: "没有真实营业数据时，任何营业额预测都只是愿望。先证明每天能达到保本订单。"
      };
    }

    if (metrics.monthlyProfit < 0 && metrics.runway < 3) {
      return {
        decision: "EXIT",
        title: "立即准备缩店或退出",
        reason: `保持现状只能再撑 ${metrics.runway.toFixed(1)} 个月。先保护现金，不要让过去的投入决定下一笔钱。`
      };
    }
    if (metrics.coverage < .65) {
      return {
        decision: "STOP",
        title: "停止追加投入，基本模型还没成立",
        reason: "当前营业额离保本线太远。继续装修、打折或投流，大概率只是放大错误。"
      };
    }
    if (
      metrics.monthlyProfit < 0 ||
      input.trafficMatch !== "yes" ||
      input.visibility !== "yes" ||
      input.retention !== "yes"
    ) {
      return {
        decision: "TEST",
        title: "先修一个断点，不要同时乱改",
        reason: "先确认问题发生在目标客流、门头理解、成交还是复购，再决定是否继续花钱。"
      };
    }
    if (metrics.coverage >= 1.1 && metrics.qualitative >= .8) {
      return {
        decision: "GO",
        title: "基本模型成立，可以小步放大",
        reason: "经营现金流已经越过保本线。扩张仍要分阶段进行，并提前写下停止线。"
      };
    }
    return {
      decision: "TEST",
      title: "先做小测试，暂时不要追加投入",
      reason: "先用一个便宜、可逆的实验验证关键假设，再决定下一笔钱。"
    };
  }

  function riskValue(value, formatter) {
    return value === null ? "待补证据" : formatter(value);
  }

  function buildRisks(input, metrics) {
    const risks = [
      {
        label: "保本压力",
        value: riskValue(metrics.breakEvenOrders, (value) => `${Math.ceil(value)} 单/天`),
        level: metrics.breakEvenOrders === null
          ? "high"
          : metrics.breakEvenOrders > 120 ? "high" : metrics.breakEvenOrders > 60 ? "medium" : "low"
      },
      {
        label: "现场证据",
        value: riskValue(metrics.qualitative, (value) => `${Math.round(value * 100)}%`),
        level: metrics.qualitative === null
          ? "high"
          : metrics.qualitative < .5 ? "high" : metrics.qualitative < .8 ? "medium" : "low"
      },
      {
        label: input.stage === "preopen" ? "投入 / 可用现金" : "债务 / 可用现金",
        value: riskValue(metrics.commitmentRatio, (value) => `${value.toFixed(1)}×`),
        level: metrics.commitmentRatio === null
          ? "high"
          : metrics.commitmentRatio > 1 ? "high" : metrics.commitmentRatio > .5 ? "medium" : "low"
      }
    ];
    if (input.stage === "operating") {
      risks.splice(1, 0, {
        label: "现金寿命",
        value: metrics.runway === null
          ? "待补证据"
          : metrics.runway === Infinity ? "正现金流" : `${metrics.runway.toFixed(1)} 月`,
        level: metrics.runway === null
          ? "high"
          : metrics.runway < 3 ? "high" : metrics.runway < 6 ? "medium" : "low"
      });
    }
    return risks;
  }

  function buildScenarios(input, metrics) {
    if (input.stage === "operating") {
      if (
        input.monthlyRevenue === null ||
        metrics.grossMargin === null ||
        metrics.fixedCosts === null ||
        metrics.monthlyProfit === null
      ) return [];
      return [
        {
          label: "营业额下降 30%",
          value: input.monthlyRevenue * .7 * metrics.grossMargin - metrics.fixedCosts
        },
        { label: "保持现状", value: metrics.monthlyProfit },
        {
          label: "营业额提高 15%",
          value: input.monthlyRevenue * 1.15 * metrics.grossMargin - metrics.fixedCosts
        }
      ];
    }
    if (
      metrics.breakEvenMonthly === null ||
      metrics.breakEvenDaily === null ||
      metrics.breakEvenOrders === null
    ) return [];
    return [
      { label: "保本的月营业额", value: metrics.breakEvenMonthly },
      { label: "保本的日营业额", value: metrics.breakEvenDaily },
      { label: "保本的日订单", value: metrics.breakEvenOrders, unit: "orders" }
    ];
  }

  function assess(rawInput = {}) {
    const input = normalizeInput(prepareInput(rawInput));
    const completeness = evidenceCompleteness(input);
    const issues = criticalEvidenceIssues(input);
    const metrics = calculateMetrics(input, completeness);
    const outcome = determineDecision(input, metrics, issues);
    const next = pickAction(input, metrics, issues);

    return {
      ...outcome,
      nextAction: next.action,
      stopLine: next.stopLine,
      metrics,
      risks: buildRisks(input, metrics),
      scenarios: buildScenarios(input, metrics),
      evidence: {
        factVersion: input._factVersion,
        missingFacts: issues.missing,
        unconfirmedFacts: issues.unconfirmed,
        ready: outcome.decision !== "EVIDENCE"
      }
    };
  }

  function normalizeServerStage(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (
      normalized === "preopen" ||
      ["准备开店", "接店", "加盟"].some((item) => normalized.includes(item))
    ) return "preopen";
    return "operating";
  }

  function serverCaseBaseInput(serverCase = {}, overrides = {}) {
    const location = serverCase.location && typeof serverCase.location === "object"
      ? serverCase.location
      : {};
    const context = location.context && typeof location.context === "object"
      ? location.context
      : {};
    const recordedStage = overrides.stage ||
      serverCase.stage ||
      serverCase.facts?.stage?.value ||
      "operating";
    return {
      stage: normalizeServerStage(recordedStage),
      locationConfirmed: overrides.locationConfirmed ??
        (location.confirmed === true || serverCase.locationConfirmed === true),
      mapContextLoaded: overrides.mapContextLoaded ??
        Boolean(location.confirmed === true && Object.keys(context).length),
      ...overrides
    };
  }

  function metricRangeSummary(conservativeMetrics, optimisticMetrics, rangedFields) {
    const bounds = {};
    const keys = new Set([
      ...Object.keys(conservativeMetrics || {}),
      ...Object.keys(optimisticMetrics || {})
    ]);
    for (const key of keys) {
      const conservative = conservativeMetrics?.[key];
      const optimistic = optimisticMetrics?.[key];
      if (
        (typeof conservative !== "number" || Number.isNaN(conservative)) &&
        (typeof optimistic !== "number" || Number.isNaN(optimistic))
      ) continue;
      bounds[key] = {
        conservative: typeof conservative === "number" && !Number.isNaN(conservative)
          ? conservative
          : null,
        optimistic: typeof optimistic === "number" && !Number.isNaN(optimistic)
          ? optimistic
          : null
      };
    }
    return {
      policy: "ranges-are-never-midpointed-or-used-to-issue-GO",
      rangedFields,
      metrics: bounds
    };
  }

  function assessServerFacts(rawFacts = {}, baseInput = {}) {
    if (!FactStore?.toDecisionInputFromServerFacts) {
      throw new Error("FactStore server adapter is required");
    }
    const decisionInput = FactStore.toDecisionInputFromServerFacts(rawFacts, baseInput);
    const result = assess(decisionInput);
    const bounded = FactStore.toDecisionBoundInputsFromServerFacts(rawFacts, baseInput);
    const rangeBounds = bounded.rangedFields.length
      ? metricRangeSummary(
        assess(bounded.conservative).metrics,
        assess(bounded.optimistic).metrics,
        bounded.rangedFields
      )
      : {
        policy: "no-ranged-facts",
        rangedFields: [],
        metrics: {}
      };
    return {
      ...result,
      rangeBounds,
      adapter: {
        warnings: decisionInput._adapterWarnings || [],
        ignoredClientDecision: true
      }
    };
  }

  function assessServerCase(serverCase = {}, overrides = {}) {
    const rawFacts = serverCase.facts || {};
    return assessServerFacts(rawFacts, serverCaseBaseInput(serverCase, overrides));
  }

  function toServerDeterministicResult(serverCase = {}, overrides = {}) {
    const result = assessServerCase(serverCase, overrides);
    return {
      decision: result.decision,
      title: result.title,
      reason: result.reason,
      metrics: result.metrics,
      nextAction: result.nextAction,
      stopLine: result.stopLine,
      risks: result.risks,
      scenarios: result.scenarios,
      evidence: result.evidence,
      rangeBounds: result.rangeBounds,
      adapter: result.adapter
    };
  }

  return {
    assess,
    evidenceCompleteness,
    assessServerFacts,
    assessServerCase,
    toServerDeterministicResult
  };
}));
