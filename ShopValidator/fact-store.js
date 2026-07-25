(function attachFactStore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.FactStore = api;
}(typeof globalThis !== "undefined" ? globalThis : window, function createFactStore() {
  const STATUSES = Object.freeze([
    "confirmed",
    "provisional",
    "assumption",
    "unknown",
    "conflict"
  ]);
  const SOURCES = Object.freeze([
    "voice",
    "typed",
    "choice",
    "map",
    "document",
    "calculation"
  ]);
  const EVIDENCE_GRADES = Object.freeze(["A", "B", "C", "D", "U"]);
  const DECISION_FIELDS = Object.freeze([
    "monthlyRevenue",
    "variableCostRate",
    "fixedCostTotal",
    "rent",
    "labor",
    "ownerReplacementWage",
    "otherFixed",
    "cashReserve",
    "avgTicket",
    "plannedCommitment",
    "debt",
    "trafficMatch",
    "visibility",
    "retention",
    "category",
    "bottleneck",
    "growthBottleneck",
    "dailyOrders",
    "channelMix",
    "leaseRemaining",
    "trialSale",
    "targetCustomer",
    "reversibleInvestment",
    "staffCapacity",
    "exitCost"
  ]);
  const MONTHLY_FLOW_FIELDS = new Set([
    "monthlyRevenue",
    "fixedCostTotal",
    "rent",
    "labor",
    "ownerReplacementWage",
    "otherFixed"
  ]);
  const NUMERIC_DECISION_FIELDS = new Set([
    "monthlyRevenue",
    "variableCostRate",
    "fixedCostTotal",
    "rent",
    "labor",
    "ownerReplacementWage",
    "otherFixed",
    "cashReserve",
    "avgTicket",
    "plannedCommitment",
    "debt"
  ]);
  const CHOICE_DECISION_FIELDS = new Set(["trafficMatch", "visibility", "retention", "trialSale", "reversibleInvestment"]);

  const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
  const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const finiteNumber = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (
      typeof value === "string" &&
      /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim())
    ) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  };

  function defaultEvidenceGrade(status) {
    if (status === "confirmed") return "B";
    if (status === "provisional") return "C";
    if (status === "assumption") return "D";
    return "U";
  }

  function normalizeRange(rawRange) {
    if (!rawRange || typeof rawRange !== "object") return null;
    const min = finiteNumber(rawRange.min);
    const max = finiteNumber(rawRange.max);
    if (min === null || max === null) return null;
    return min <= max ? { min, max } : { min: max, max: min };
  }

  function normalizeFact(rawFact = {}) {
    const field = String(rawFact.field || rawFact.key || rawFact.id || "").trim();
    if (!field) throw new TypeError("fact.field is required");

    const status = STATUSES.includes(rawFact.status) ? rawFact.status : "provisional";
    const source = SOURCES.includes(rawFact.source) ? rawFact.source : "typed";
    const evidenceGrade = EVIDENCE_GRADES.includes(rawFact.evidenceGrade)
      ? rawFact.evidenceGrade
      : defaultEvidenceGrade(status);
    const range = normalizeRange(rawFact.range);
    const unusable = status === "unknown" || status === "conflict";
    const value = unusable || range
      ? null
      : hasOwn(rawFact, "value") && rawFact.value !== undefined
        ? rawFact.value
        : null;

    return {
      id: String(rawFact.id || field),
      field,
      value,
      range: unusable ? null : range,
      unit: rawFact.unit == null ? null : String(rawFact.unit),
      period: rawFact.period == null ? null : String(rawFact.period),
      status,
      source,
      evidenceGrade,
      rawTranscript: rawFact.rawTranscript == null ? null : String(rawFact.rawTranscript),
      alternatives: status === "conflict" && Array.isArray(rawFact.alternatives)
        ? clone(rawFact.alternatives)
        : [],
      derivedFrom: rawFact.derivedFrom == null ? null : String(rawFact.derivedFrom),
      revision: Number.isInteger(rawFact.revision) && rawFact.revision > 0
        ? rawFact.revision
        : 1,
      updatedAt: rawFact.updatedAt == null ? null : String(rawFact.updatedAt)
    };
  }

  function isUsableFact(fact) {
    return Boolean(
      fact &&
      ["confirmed", "provisional", "assumption"].includes(fact.status) &&
      (fact.value !== null || fact.range !== null)
    );
  }

  function isExactFact(fact) {
    return Boolean(isUsableFact(fact) && fact.range === null && fact.value !== null);
  }

  function factExactValue(fact) {
    return isExactFact(fact) ? fact.value : undefined;
  }

  function createArchive(options = {}) {
    const archive = {
      schemaVersion: 1,
      caseId: options.caseId == null ? null : String(options.caseId),
      revision: 0,
      facts: {},
      history: []
    };
    const initialFacts = Array.isArray(options)
      ? options
      : Array.isArray(options.facts)
        ? options.facts
        : options.facts && typeof options.facts === "object"
          ? Object.values(options.facts)
          : [];
    return initialFacts.reduce((current, fact) => upsertFact(current, fact), archive);
  }

  function comparableFact(fact) {
    const copy = clone(fact);
    delete copy.revision;
    delete copy.updatedAt;
    return copy;
  }

  function upsertFact(rawArchive, rawFact, options = {}) {
    const archive = rawArchive && rawArchive.schemaVersion === 1
      ? clone(rawArchive)
      : createArchive();
    const nextFact = normalizeFact(rawFact);
    const previous = archive.facts[nextFact.field] || null;

    if (
      previous &&
      JSON.stringify(comparableFact(previous)) === JSON.stringify(comparableFact(nextFact))
    ) {
      return archive;
    }

    archive.revision += 1;
    nextFact.revision = previous ? previous.revision + 1 : 1;
    nextFact.updatedAt = options.changedAt || nextFact.updatedAt || new Date().toISOString();
    archive.facts[nextFact.field] = nextFact;
    archive.history.push({
      archiveRevision: archive.revision,
      field: nextFact.field,
      previous: clone(previous),
      next: clone(nextFact),
      changedAt: nextFact.updatedAt
    });
    return archive;
  }

  function markUnknown(archive, field, options = {}) {
    return upsertFact(archive, {
      field,
      status: "unknown",
      source: options.source || "choice",
      evidenceGrade: "U",
      rawTranscript: options.rawTranscript || null
    }, options);
  }

  function listFacts(input) {
    if (!input) return [];
    if (Array.isArray(input)) return input.map(normalizeFact);
    if (input.schemaVersion === 1 && input.facts) {
      return Object.values(input.facts).map(normalizeFact);
    }
    if (input.facts && !Array.isArray(input.facts)) {
      return Object.values(input.facts).map(normalizeFact);
    }
    if (Array.isArray(input.facts)) return input.facts.map(normalizeFact);
    return Object.values(input).map(normalizeFact);
  }

  function toDecisionInput(input, baseInput = {}) {
    const facts = listFacts(input);
    const decisionInput = {
      ...baseInput,
      known: { ...(baseInput.known || {}) },
      _factMode: true,
      _factVersion: input && Number.isInteger(input.revision) ? input.revision : null,
      _factMeta: {}
    };

    for (const fact of facts) {
      decisionInput._factMeta[fact.field] = fact;
      decisionInput.known[fact.field] = isExactFact(fact);
      if (isExactFact(fact)) decisionInput[fact.field] = fact.value;
      else delete decisionInput[fact.field];
    }
    // Older archives may contain a cost breakdown rather than the newer
    // single fixed-cost answer. Derive it once, visibly marked as a calculation.
    if (!isExactFact(decisionInput._factMeta.fixedCostTotal)) {
      const parts = ["rent", "labor", "otherFixed"];
      const ownerFact = decisionInput._factMeta.ownerReplacementWage;
      if (parts.every((field) => isExactFact(decisionInput._factMeta[field])) && (!ownerFact || isExactFact(ownerFact))) {
        const owner = ownerFact ? Number(decisionInput.ownerReplacementWage) : 0;
        const value = parts.reduce((sum, field) => sum + Number(decisionInput[field]), owner);
        const derived = normalizeFact({ field: "fixedCostTotal", value, unit: "CNY", period: "month", status: "confirmed", source: "calculation", evidenceGrade: "B", derivedFrom: parts.join("+") });
        decisionInput._factMeta.fixedCostTotal = derived;
        decisionInput.known.fixedCostTotal = true;
        decisionInput.fixedCostTotal = value;
      }
    }
    return decisionInput;
  }

  function canonicalPeriod(period) {
    const normalized = String(period || "").trim().toLowerCase();
    if (["year", "annual", "annually", "年", "每年"].includes(normalized)) return "year";
    if (["month", "monthly", "月", "每月"].includes(normalized)) return "month";
    if (["day", "daily", "日", "天", "每天", "每日"].includes(normalized)) return "day";
    if (["order", "per_order", "单", "每单"].includes(normalized)) return "order";
    if (["sale", "sales", "revenue", "营业额", "销售额"].includes(normalized)) return "sale";
    if (["current", "total", "now", "当前", "总额"].includes(normalized)) return "current";
    return normalized || null;
  }

  function normalizeChoice(value) {
    if (value === true) return "yes";
    if (value === false) return "no";
    const normalized = String(value ?? "").trim().toLowerCase();
    if (["yes", "y", "是", "有", "高", "匹配"].includes(normalized)) return "yes";
    if (["no", "n", "否", "没有", "无", "低", "不匹配"].includes(normalized)) return "no";
    if (["unknown", "不知道", "不清楚", "不确定"].includes(normalized)) return "unknown";
    return null;
  }

  function monthlyPeriodFactor(field, period) {
    if (!MONTHLY_FLOW_FIELDS.has(field)) return 1;
    if (period === "year") return 1 / 12;
    if (period === "day") return 30;
    return 1;
  }

  function normalizeServerFact(rawFact = {}, fallbackField = "") {
    const field = String(rawFact.field || rawFact.id || fallbackField || "").trim();
    if (!DECISION_FIELDS.includes(field)) {
      return { fact: null, warning: field ? `unsupported-field:${field}` : "missing-field" };
    }

    const rawStatus = String(rawFact.status || "provisional").trim();
    const status = STATUSES.includes(rawStatus) ? rawStatus : "provisional";
    const period = canonicalPeriod(rawFact.period);
    const common = {
      ...rawFact,
      id: field,
      field,
      period,
      evidenceGrade: rawFact.evidenceGrade || rawFact.evidence,
      rawTranscript: rawFact.rawTranscript ?? rawFact.transcript ?? rawFact.raw,
      status
    };

    if (status === "unknown" || status === "conflict") {
      return { fact: normalizeFact({ ...common, value: null, range: null }), warning: null };
    }

    if (CHOICE_DECISION_FIELDS.has(field)) {
      const choice = normalizeChoice(rawFact.value);
      if (!choice || choice === "unknown") {
        return {
          fact: normalizeFact({
            ...common,
            value: null,
            range: null,
            status: "unknown",
            evidenceGrade: "U"
          }),
          warning: choice ? null : `invalid-choice:${field}`
        };
      }
      return { fact: normalizeFact({ ...common, value: choice, range: null }), warning: null };
    }

    if (["category", "bottleneck", "growthBottleneck", "channelMix", "leaseRemaining", "targetCustomer"].includes(field)) {
      const value = String(rawFact.value || "").trim().slice(0, 80);
      return value
        ? { fact: normalizeFact({ ...common, value, range: null }), warning: null }
        : {
          fact: normalizeFact({
            ...common,
            value: null,
            range: null,
            status: "unknown",
            evidenceGrade: "U"
          }),
          warning: "invalid-category"
        };
    }

    const factor = monthlyPeriodFactor(field, period);
    const rawRange = rawFact.range && typeof rawFact.range === "object"
      ? {
        min: finiteNumber(rawFact.range.min),
        max: finiteNumber(rawFact.range.max)
      }
      : null;
    let range = rawRange && rawRange.min !== null && rawRange.max !== null
      ? {
        min: Math.min(rawRange.min, rawRange.max) * factor,
        max: Math.max(rawRange.min, rawRange.max) * factor
      }
      : null;
    let value = range ? null : finiteNumber(rawFact.value);
    if (value !== null) value *= factor;
    if (range && (range.min < 0 || range.max < 0)) range = null;
    if (value !== null && value < 0) value = null;
    if (
      field === "variableCostRate" &&
      ((value !== null && (value < 0 || value > 100)) ||
        (range && (range.min < 0 || range.max > 100)))
    ) {
      value = null;
      range = null;
    }
    if (value === null && range === null) {
      return {
        fact: normalizeFact({
          ...common,
          value: null,
          range: null,
          status: "unknown",
          evidenceGrade: "U"
        }),
        warning: `invalid-number:${field}`
      };
    }

    return {
      fact: normalizeFact({
        ...common,
        value,
        range,
        period: MONTHLY_FLOW_FIELDS.has(field) ? "month" : period
      }),
      warning: null
    };
  }

  function adaptServerFacts(rawFacts = {}) {
    const entries = Array.isArray(rawFacts)
      ? rawFacts.map((fact) => [fact?.field || fact?.id || "", fact])
      : Object.entries(rawFacts || {});
    const facts = [];
    const warnings = [];
    for (const [fallbackField, rawFact] of entries) {
      if (!rawFact || typeof rawFact !== "object") {
        warnings.push(`invalid-fact:${fallbackField}`);
        continue;
      }
      const adapted = normalizeServerFact(rawFact, fallbackField);
      if (adapted.fact) facts.push(adapted.fact);
      if (adapted.warning) warnings.push(adapted.warning);
    }
    return { facts, warnings };
  }

  function toDecisionInputFromServerFacts(rawFacts, baseInput = {}) {
    const adapted = adaptServerFacts(rawFacts);
    const input = toDecisionInput(adapted.facts, baseInput);
    input._adapterWarnings = adapted.warnings;
    return input;
  }

  function boundValue(field, range, mode) {
    const adverseHigh = new Set([
      "variableCostRate",
      "rent",
      "labor",
      "ownerReplacementWage",
      "otherFixed",
      "plannedCommitment",
      "debt"
    ]);
    const useHigh = mode === "conservative"
      ? adverseHigh.has(field)
      : !adverseHigh.has(field);
    return useHigh ? range.max : range.min;
  }

  function toDecisionBoundInputsFromServerFacts(rawFacts, baseInput = {}) {
    const adapted = adaptServerFacts(rawFacts);
    const makeInput = (mode) => {
      const boundedFacts = adapted.facts.map((fact) => fact.range
        ? normalizeFact({
          ...fact,
          value: boundValue(fact.field, fact.range, mode),
          range: null,
          status: "confirmed",
          evidenceGrade: "B"
        })
        : fact);
      const input = toDecisionInput(boundedFacts, baseInput);
      input._adapterWarnings = adapted.warnings;
      return input;
    };
    return {
      conservative: makeInput("conservative"),
      optimistic: makeInput("optimistic"),
      rangedFields: adapted.facts.filter((fact) => fact.range).map((fact) => fact.field),
      warnings: adapted.warnings
    };
  }

  function complementPercentFact(rawFact, targetField) {
    const fact = normalizeFact(rawFact);
    const convertedRange = fact.range
      ? { min: 100 - fact.range.max, max: 100 - fact.range.min }
      : null;
    const convertedValue = typeof fact.value === "number" && Number.isFinite(fact.value)
      ? 100 - fact.value
      : null;

    return normalizeFact({
      ...fact,
      id: targetField,
      field: targetField,
      value: convertedValue,
      range: convertedRange,
      unit: "%",
      source: "calculation",
      derivedFrom: fact.field,
      revision: 1,
      updatedAt: null
    });
  }

  function grossMarginToVariableCostRate(fact) {
    return complementPercentFact(fact, "variableCostRate");
  }

  function variableCostRateToGrossMargin(fact) {
    return complementPercentFact(fact, "grossMarginRate");
  }

  return {
    STATUSES,
    SOURCES,
    EVIDENCE_GRADES,
    DECISION_FIELDS,
    normalizeFact,
    isUsableFact,
    isExactFact,
    factExactValue,
    createArchive,
    upsertFact,
    markUnknown,
    listFacts,
    toDecisionInput,
    normalizeServerFact,
    adaptServerFacts,
    toDecisionInputFromServerFacts,
    toDecisionBoundInputsFromServerFacts,
    grossMarginToVariableCostRate,
    variableCostRateToGrossMargin
  };
}));
