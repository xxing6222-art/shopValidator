const DOMAINS = [
  "现金与退出", "位置与目标客流", "门头与进店转化", "产品与菜单",
  "价格与客单", "复购与购买理由", "堂食与外卖渠道", "人员与排班",
  "产能与流程", "采购与损耗", "房租与租约", "加盟与转让",
  "试卖与预售"
];

const REQUIRED_TEXT = [
  "bottleneck", "mechanism", "hypothesis", "action", "metric",
  "success_line", "stop_line", "falsification", "domain"
];

const VERIFY_CRITERIA = {
  evidence: [
    "事实引用真实", "未把推断写成事实", "击中第一断点",
    "考虑替代解释", "实验可证伪", "不与现有方案同义"
  ],
  execution: [
    "使用给定计算而非心算", "预算安全", "期限不超过现金寿命",
    "人员合同场地可执行", "方案可逆", "有停止线",
    "无明显劳动隐私安全风险"
  ]
};

const compact = (value, max = 220) => String(value ?? "").trim().slice(0, max);

// Number(null), Number("") and Number(" ") are all zero. That coercion is
// dangerous in a financial decision engine, so only real numbers and
// non-empty numeric strings are accepted.
const finite = (value, fallback = null) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value !== "string" || !value.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isPlainObject = (value) => (
  value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
);

function validateRawCandidate(raw) {
  const reasons = [];
  if (!isPlainObject(raw)) return { pass: false, reasons: ["候选不是JSON对象"] };

  for (const field of REQUIRED_TEXT) {
    if (typeof raw[field] !== "string" || !raw[field].trim()) {
      reasons.push(`${field} 必须是非空字符串`);
    }
  }
  if (!Array.isArray(raw.evidence_refs) || !raw.evidence_refs.length
    || raw.evidence_refs.some((item) => typeof item !== "string" || !item.trim())) {
    reasons.push("evidence_refs 必须是非空字符串数组");
  }
  if (typeof raw.budget_cap !== "number" || !Number.isFinite(raw.budget_cap) || raw.budget_cap < 0) {
    reasons.push("budget_cap 必须是大于等于0的有限数字");
  }
  if (typeof raw.duration_days !== "number" || !Number.isInteger(raw.duration_days)
    || raw.duration_days < 1 || raw.duration_days > 90) {
    reasons.push("duration_days 必须是1—90的整数");
  }
  if (!["high", "medium", "low"].includes(raw.reversibility)) {
    reasons.push("reversibility 必须是 high、medium 或 low");
  }
  if (!isPlainObject(raw.expected_effect)) {
    reasons.push("expected_effect 必须是JSON对象");
  }
  for (const field of ["assumptions", "contraindications"]) {
    if (!Array.isArray(raw[field])
      || raw[field].some((item) => typeof item !== "string" || !item.trim())) {
      reasons.push(`${field} 必须是字符串数组`);
    }
  }
  return { pass: reasons.length === 0, reasons };
}

function normalizeCandidate(raw, id) {
  return {
    id,
    bottleneck: compact(raw?.bottleneck),
    mechanism: compact(raw?.mechanism),
    hypothesis: compact(raw?.hypothesis),
    evidence_refs: Array.isArray(raw?.evidence_refs)
      ? raw.evidence_refs.map((item) => compact(item, 80)).filter(Boolean).slice(0, 8)
      : [],
    action: compact(raw?.action, 400),
    budget_cap: finite(raw?.budget_cap),
    duration_days: finite(raw?.duration_days),
    metric: compact(raw?.metric),
    success_line: compact(raw?.success_line),
    stop_line: compact(raw?.stop_line),
    reversibility: ["high", "medium", "low"].includes(raw?.reversibility)
      ? raw.reversibility
      : null,
    expected_effect: isPlainObject(raw?.expected_effect)
      ? raw.expected_effect
      : null,
    assumptions: Array.isArray(raw?.assumptions)
      ? raw.assumptions.map((item) => compact(item)).filter(Boolean).slice(0, 8)
      : [],
    contraindications: Array.isArray(raw?.contraindications)
      ? raw.contraindications.map((item) => compact(item)).filter(Boolean).slice(0, 8)
      : [],
    falsification: compact(raw?.falsification),
    domain: compact(raw?.domain, 80),
    search_round: finite(raw?.search_round, 1)
  };
}

function factRangeLowerBound(fact) {
  const source = fact?.value ?? fact;
  const ranges = [
    fact?.range,
    isPlainObject(source) ? source.range : null,
    isPlainObject(source) ? source : null
  ].filter(Boolean);
  for (const range of ranges) {
    const minimum = finite(range?.min);
    if (minimum !== null) return minimum;
  }
  if (Array.isArray(source) && source.length) {
    const values = source.map((item) => finite(item)).filter((item) => item !== null);
    if (values.length) return Math.min(...values);
  }
  return finite(source);
}

function expectedEffectGate(candidate) {
  const reasons = [];
  if (!isPlainObject(candidate.expected_effect)) {
    return ["expected_effect 不是对象"];
  }

  const numericEffects = new Map();
  const visit = (value, path = []) => {
    if (isPlainObject(value)) {
      for (const [key, nested] of Object.entries(value)) visit(nested, [...path, key]);
      return;
    }
    if (Array.isArray(value) || value === null || typeof value === "boolean") {
      reasons.push(`expected_effect.${path.join(".")} 类型无效`);
      return;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) reasons.push(`expected_effect.${path.join(".")} 不是有限数字`);
      else numericEffects.set(path.join(".").toLowerCase(), value);
      return;
    }
    if (typeof value !== "string" || !value.trim()) {
      reasons.push(`expected_effect.${path.join(".")} 不能为空`);
    }
  };
  visit(candidate.expected_effect);

  for (const [key, value] of numericEffects) {
    if (/(^|\.)(budget|spend|investment|experiment_cost|预算|花费|投入|实验成本)$/i.test(key)) {
      if (value < 0) reasons.push(`expected_effect.${key} 不能为负数`);
      if (value > candidate.budget_cap) reasons.push(`expected_effect.${key} 超过预算上限`);
    }
    if (/(duration|days|期限|天数)/i.test(key)
      && (value < 0 || value > candidate.duration_days)) {
      reasons.push(`expected_effect.${key} 超过方案期限`);
    }
    if (/(probability|confidence|rate|ratio|概率|置信)/i.test(key)
      && (value < -100 || value > 100)) {
      reasons.push(`expected_effect.${key} 超出合理百分比范围`);
    }
  }

  const findEffect = (patterns) => {
    const entry = [...numericEffects.entries()]
      .find(([key]) => patterns.some((pattern) => key.includes(pattern)));
    return entry?.[1] ?? null;
  };
  const revenueDelta = findEffect(["revenue_delta", "收入增量", "营收增量"]);
  const costDelta = findEffect(["cost_delta", "成本增量"]);
  const profitDelta = findEffect(["profit_delta", "利润增量"]);
  if ([revenueDelta, costDelta, profitDelta].every((value) => value !== null)) {
    const expectedProfit = revenueDelta - costDelta;
    const tolerance = Math.max(1, Math.abs(expectedProfit) * 0.05);
    if (Math.abs(expectedProfit - profitDelta) > tolerance) {
      reasons.push("expected_effect 的收入、成本与利润增量算术不一致");
    }
  }
  return reasons;
}

function programmaticGate(candidate, context) {
  const reasons = [];
  if (!Number.isFinite(candidate.budget_cap) || candidate.budget_cap < 0) {
    reasons.push("预算无效");
  }
  if (!Number.isInteger(candidate.duration_days)
    || candidate.duration_days < 1 || candidate.duration_days > 90) {
    reasons.push("期限无效");
  }

  const cashReserve = factRangeLowerBound(context.facts?.cashReserve);
  if (cashReserve !== null && cashReserve >= 0 && candidate.budget_cap > cashReserve * 0.2) {
    reasons.push("单次实验预算超过保守现金储备下界的20%");
  }
  const runwayMonths = finite(context.metrics?.runway);
  if (runwayMonths !== null && runwayMonths >= 0
    && candidate.duration_days > Math.floor(runwayMonths * 30)) {
    reasons.push("实验期限超过现金寿命");
  }
  reasons.push(...expectedEffectGate(candidate));
  return { pass: reasons.length === 0, reasons, cashReserveLowerBound: cashReserve };
}

function hardGate(candidate, context) {
  const reasons = [];
  for (const field of REQUIRED_TEXT) {
    if (!candidate[field]) reasons.push(`缺少 ${field}`);
  }
  if (!["high", "medium", "low"].includes(candidate.reversibility)) {
    reasons.push("可逆性无效");
  }
  if (!candidate.evidence_refs.length) reasons.push("没有事实引用");
  const factIds = new Set(Object.keys(context.facts || {}));
  const missingRefs = candidate.evidence_refs.filter((reference) => !factIds.has(reference));
  if (missingRefs.length) reasons.push(`事实引用不存在：${missingRefs.join("、")}`);

  const programmatic = programmaticGate(candidate, context);
  reasons.push(...programmatic.reasons);

  const combined = [
    candidate.bottleneck, candidate.mechanism, candidate.hypothesis,
    candidate.action, candidate.assumptions.join(" ")
  ].join(" ");
  if (/地图|POI|附近店|学校|商场/.test(combined) && /证明|说明|等于/.test(combined) && /人流|客流/.test(combined)) {
    reasons.push("把地图或POI当成人流证据");
  }
  if (/裁掉|开除|辞退/.test(combined) && !context.flags?.hasStaffCapacityEvidence) {
    reasons.push("没有岗位与产能证据却建议解雇具体员工");
  }
  if (/签约|加盟|装修|扩店|开分店/.test(combined)) {
    if (context.decision === "EVIDENCE") reasons.push("证据不足时建议不可逆投入");
    const runway = finite(context.metrics?.runway);
    if (candidate.reversibility === "low" && runway !== null && runway < 3) {
      reasons.push("现金寿命不足时建议长期不可逆投入");
    }
  }
  const grossMargin = finite(context.metrics?.grossMargin);
  if (/投流|推广|引流|扩大流量/.test(combined) && grossMargin !== null && grossMargin <= 0) {
    reasons.push("单位经济为负时先扩大流量");
  }
  return {
    pass: reasons.length === 0,
    reasons: [...new Set(reasons)],
    programmatic
  };
}

function signature(candidate) {
  return [
    candidate.domain, candidate.bottleneck, candidate.mechanism,
    candidate.metric, candidate.success_line
  ]
    .join("|")
    .toLowerCase()
    .replace(/[\s，。；、:：\-_/]/g, "")
    .slice(0, 240);
}

// These are deliberately evidence-gathering tasks, not fabricated business
// prescriptions. They let a paid run keep its 3x2 audit shape when a model
// returns malformed JSON, while the same hard gates still decide eligibility.
const SAFETY_BACKFILL_TEMPLATES = [
  ["现金与退出", "缺少每日收支核对证据", "把收款记录与实际支出逐日对齐", "连续记录能发现现金流缺口来自收入、采购还是固定支出", "核对一天的收款凭证与全部支出凭证", "当日未解释收支项目数", "每一笔差额都有证据来源", "无法取得凭证就停止推断", "补齐凭证后仍无法解释差额"],
  ["位置与目标客流", "缺少现场客流漏斗证据", "分开记录经过、目标顾客、看见、进店和下单", "现场分段计数能定位最早断点", "选择一个营业时段做一次20分钟五段计数", "五段漏斗完整记录", "五段都有可复核计数", "环境异常或无法区分目标顾客时停止", "记录仍不能定位最早断点"],
  ["门头与进店转化", "缺少门头理解证据", "询问路过者能否快速说清店铺卖什么", "理解困难可能发生在进店之前", "请五名路过者看门头后复述品类和价格带", "正确复述人数", "得到五份独立复述记录", "不能取得同意就停止询问", "多数人都能正确复述"],
  ["产品与菜单", "缺少SKU贡献证据", "把销量、售价和可确认成本按SKU并列", "少数SKU可能承担主要经营结果", "从现有小票中整理一天的SKU销量与可确认成本", "有完整记录的SKU数", "主要SKU都有销量和成本证据", "成本无法核实时不计算毛利", "仍无法识别主要SKU"],
  ["价格与客单", "缺少价格异议证据", "只记录顾客放弃下单时主动说出的原因", "价格可能不是唯一成交断点", "在一个时段匿名记录顾客主动提出的放弃原因", "可归因的放弃原因数", "每条原因都有当场原话", "不追问隐私且样本不足时停止下结论", "价格并非主要被提及原因"],
  ["复购与购买理由", "缺少真实复购理由证据", "回访最近顾客并区分再次购买与礼貌回答", "付费行为比口头喜欢更能验证复购", "回访近期顾客，只记录可核验的再次购买行为", "可核验复购记录数", "复购记录能对应订单", "无法取得同意就停止回访", "口头反馈与订单行为不一致"],
  ["堂食与外卖渠道", "缺少渠道单位经济证据", "按同一订单口径核对实收与可确认渠道扣费", "渠道流水可能高于实际可用收入", "各抽取一笔堂食和外卖订单核对实收与扣费", "已核对渠道订单数", "每笔订单都有实收和扣费凭证", "缺任一凭证就不比较渠道", "两渠道差异无法由凭证解释"],
  ["人员与排班", "缺少订单与工时匹配证据", "按半小时同时记录订单和在岗人数", "问题可能是时段错配而非人员总数", "记录一个营业日的半小时订单数与在岗人数", "完整时段记录数", "营业时段记录连续且可复核", "记录影响正常工作时停止", "各时段工时与订单没有明显错配"],
  ["产能与流程", "缺少出餐瓶颈证据", "对真实订单标记接单、开始和完成时间", "最长等待可能集中在单一工序", "抽样记录五笔订单的三个时间点", "完整订单时间链数量", "五笔订单都有完整时间链", "忙碌时影响安全就停止记录", "等待时间不集中于同一工序"],
  ["采购与损耗", "缺少损耗来源证据", "把报损按原料、原因和时间记录", "可见损耗可能集中在少数原料或流程", "记录一天实际报损，不用估算补齐缺失值", "有称重或数量凭证的报损项", "报损项都有原因和数量证据", "无法测量就标未知", "报损没有可重复集中来源"],
  ["房租与租约", "缺少租约责任证据", "从合同原文提取金额、周期和退出条款", "口头记忆可能遗漏真实退出成本", "只摘录合同中的租金周期、剩余期限和退出条款", "已取得的合同条款项", "关键条款均能回指原文", "没有合同原文就保持未知", "原文与口述没有差异"],
  ["加盟与转让", "缺少费用全貌证据", "区分一次性、持续性和强制采购费用", "总投入可能被分散在不同名目中", "从已有材料列出费用名称、周期与原文来源", "有原文来源的费用项", "每项费用均标明周期和来源", "无材料时不估算总额", "不存在遗漏费用项"],
  ["试卖与预售", "缺少付费意愿证据", "用可退款的小范围意向登记替代口头喜欢", "真实行动能过滤礼貌性反馈", "先收集明确同意的可退款意向，不作长期承诺", "有效意向记录数", "每条意向都有品类和价格带", "涉及收款规则不清时停止", "口头兴趣不能转成有效意向"],
  ["价格与客单", "缺少客单构成证据", "将客单拆成主品、加购与折扣", "平均值可能掩盖不同订单结构", "从当天小票抽取五笔并按构成分类", "完整订单构成记录数", "五笔记录均能回指小票", "小票不完整就停止计算平均值", "订单构成没有可重复模式"],
  ["堂食与外卖渠道", "缺少退款取消原因证据", "按平台原始标签核对异常订单", "渠道损失可能来自取消、退款或超时", "整理一天异常订单并保留平台原始原因", "可回指平台的异常订单数", "每笔异常都有平台记录", "平台记录缺失就标未知", "异常没有集中原因"],
  ["门头与进店转化", "缺少排队放弃证据", "只观察排队出现时的进入与离开", "流失可能发生在顾客已决定进店之后", "在一个高峰时段记录排队人数和主动离开人数", "排队观察记录完整度", "观察时段起止和数量完整", "无法区分主动离开就停止归因", "没有观察到排队流失"],
  ["复购与购买理由", "缺少新老顾客区分证据", "在不收集身份信息的前提下询问是否首次购买", "新客和复购客可能面对不同断点", "对自愿回答的顾客只记录首次或再次购买", "有效新老客分类数", "记录不包含身份信息且来源明确", "顾客拒绝就不记录", "新老客行为没有可见差异"],
  ["现金与退出", "缺少固定成本凭证", "将固定支出按金额、周期和凭证来源列示", "遗漏固定成本会高估经营结果", "核对房租、人工、水电和其他固定支出的现有凭证", "有凭证的固定成本项", "每项金额和周期都能回指凭证", "缺少凭证就保持未知", "不存在遗漏或周期误读"],
  ["产能与流程", "缺少返工证据", "记录返工发生点而不是凭感觉评估效率", "重复制作可能造成时间与原料损失", "记录一个时段内真实发生的返工及原因", "可核验返工记录数", "每条返工有工序和原因", "记录影响食品安全时停止", "没有重复出现的返工原因"],
  ["现金与退出", "缺少退出可执行信息", "只收集合同允许的退出路径与可核验报价", "不同退出路径的现金后果可能不同", "整理合同允许的退出方式及已有书面报价", "有原文或书面报价的退出路径数", "每条路径都有证据来源", "没有书面依据就不估值", "无法取得任何可执行退出路径"]
];

function safetyBackfillCandidate(context, slot, round, degradationReason) {
  const template = SAFETY_BACKFILL_TEMPLATES[slot % SAFETY_BACKFILL_TEMPLATES.length];
  const factIds = Object.keys(context.facts || {});
  const preferred = factIds.find((id) => {
    const fact = context.facts[id];
    return fact?.status !== "unknown" && (fact?.value != null || fact?.range != null);
  }) || factIds[0] || "deterministic-decision";
  const [
    domain, bottleneck, mechanism, hypothesis, action, metric,
    successLine, stopLine, falsification
  ] = template;
  const candidate = normalizeCandidate({
    domain,
    bottleneck,
    mechanism,
    hypothesis,
    evidence_refs: [preferred],
    action,
    budget_cap: 0,
    duration_days: 1,
    metric,
    success_line: successLine,
    stop_line: stopLine,
    reversibility: "high",
    expected_effect: {},
    assumptions: ["这是模型输出不可用后的补证据任务，不代表已经确认经营诊断"],
    contraindications: [],
    falsification,
    search_round: round
  }, `safety-${slot + 1}-${crypto.randomUUID().slice(0, 8)}`);
  candidate.origin = "deterministic-safety-backfill";
  candidate.degradations = [compact(degradationReason || "生成Agent输出不可用")];
  return candidate;
}

function fallbackCandidates(context) {
  const factIds = Object.keys(context.facts || {}).slice(0, 3);
  const refs = factIds.length ? factIds : ["deterministic-decision"];
  if (context.decision === "EVIDENCE") {
    const minimumEvidence = [
      {
        domain: "财务证据",
        bottleneck: "收入与变动成本尚不能从原始记录重建",
        mechanism: "只从收款、小票、平台账单和采购凭证重建同一周期的收入与变动成本",
        hypothesis: "原始记录可以先回答是否具备正贡献毛利，而不需要猜测经营问题",
        action: "选取一个完整营业日，逐笔核对收款、小票、平台扣费、食材和包装凭证",
        budget_cap: 0, duration_days: 1, metric: "可回指原始凭证的收入与变动成本项目数",
        success_line: "同一周期的收入与变动成本均能回指原始记录",
        stop_line: "缺少原始记录时保持未知，不补估数字",
        reversibility: "high", falsification: "现有记录不足以重建同一周期账目"
      },
      {
        domain: "现金安全证据",
        bottleneck: "固定成本、可用现金与债务责任尚未完整确认",
        mechanism: "按合同、工资记录、账单和借款凭证确认全部固定责任与现金下界",
        hypothesis: "只有确认完整固定成本、现金和债务，才能判断还能验证多久",
        action: "核对房租物业、人工、水电、其他固定支出、可用现金和债务的现有凭证",
        budget_cap: 0, duration_days: 1, metric: "已确认金额、周期和来源的固定责任项目数",
        success_line: "固定成本、现金和债务均有来源，未知项被明确标记",
        stop_line: "没有凭证的项目保持未知，不按零处理",
        reversibility: "high", falsification: "仍存在无法确认的重大固定责任"
      },
      {
        domain: "位置与现场漏斗证据",
        bottleneck: "位置与真实客流转化尚无现场观察",
        mechanism: "把经过、目标顾客、看见、进店和下单分段计数",
        hypothesis: "一次现场漏斗观察可以判断下一步应继续补哪一段证据",
        action: "在店铺实际入口选择一个营业时段，完成一次20分钟五段计数",
        budget_cap: 0, duration_days: 1, metric: "经过到下单的五段现场记录完整度",
        success_line: "五段数量、时段和实际入口均有记录",
        stop_line: "无法区分目标顾客或现场异常时只记录原始观察，不作归因",
        reversibility: "high", falsification: "一次观察不足以形成稳定断点"
      }
    ];
    return minimumEvidence.map((item, index) => {
      const candidate = normalizeCandidate({
        ...item,
        evidence_refs: refs,
        assumptions: ["当前信息不足；任务只补最小证据，不提出菜单、门头或投入优化"],
        contraindications: [],
        expected_effect: {}
      }, `minimum-evidence-${index + 1}`);
      candidate.origin = "deterministic-minimum-evidence";
      return candidate;
    });
  }
  const templates = [
    {
      domain: "目标客流",
      bottleneck: "缺少现场转化证据",
      mechanism: "把经过、目标顾客、看见、进店和下单拆开计数",
      hypothesis: "问题首先发生在目标顾客不足或门头转化，而不是泛化的“人流少”",
      action: "午晚高峰各做一次20分钟五段转化计数",
      budget_cap: 0, duration_days: 2, metric: "目标顾客到下单的分段转化率",
      success_line: "两次计数能定位同一个首要断点",
      stop_line: "两次时段结论相反就补测，不追加投入",
      reversibility: "high", falsification: "换时段复测后首要断点不一致"
    },
    {
      domain: "门头",
      bottleneck: "路过者无法快速理解门店",
      mechanism: "降低理解成本，提高看见到进店的转化",
      hypothesis: "目标顾客存在，但十秒内说不清卖什么、多少钱、为何进店",
      action: "用临时打印物料做两个门头版本，各测试20名路过者",
      budget_cap: 200, duration_days: 3, metric: "十秒理解率和进店率",
      success_line: "理解率达到80%且进店率提高20%",
      stop_line: "理解率提高但进店率不变时停止改门头",
      reversibility: "high", falsification: "新门头不提高理解率"
    },
    {
      domain: "菜单",
      bottleneck: "产品组合或价格不能形成贡献毛利",
      mechanism: "减少低毛利复杂SKU，突出可复购主品",
      hypothesis: "少数SKU贡献大部分毛利，复杂菜单反而增加损耗和决策成本",
      action: "统计七天SKU销量与贡献毛利，做一版精简菜单小流量测试",
      budget_cap: 100, duration_days: 7, metric: "单均贡献毛利与出餐时间",
      success_line: "贡献毛利提高10%且出餐时间不恶化",
      stop_line: "销量或复购显著下降时恢复原菜单",
      reversibility: "high", falsification: "精简后贡献毛利没有提高"
    },
    {
      domain: "排班",
      bottleneck: "工时与订单波峰不匹配",
      mechanism: "按半小时订单量重排班，减少空闲工时",
      hypothesis: "存在不产生订单的冗余工时，而非人员绝对过多",
      action: "记录七天半小时订单和在岗人数，只调整一个班次",
      budget_cap: 0, duration_days: 7, metric: "每工时订单和超时订单率",
      success_line: "每工时订单提高15%且超时率不升高",
      stop_line: "超时率提高或员工安全无法保证时恢复排班",
      reversibility: "high", falsification: "调整后每工时订单不变"
    },
    {
      domain: "复购",
      bottleneck: "缺少稳定购买理由",
      mechanism: "从真实顾客离店原因中找出可复现的复购触发点",
      hypothesis: "一次性购买来自折扣或偶然经过，尚未形成复购理由",
      action: "回访最近10名顾客并测试一个不降价的复购承诺",
      budget_cap: 100, duration_days: 7, metric: "七日二次购买率",
      success_line: "二次购买率提高5个百分点",
      stop_line: "只有继续降价才复购时停止该方案",
      reversibility: "high", falsification: "复购承诺不改变二次购买率"
    }
  ];
  return templates.map((item, index) => normalizeCandidate({
    ...item,
    evidence_refs: refs,
    assumptions: ["当前信息可能不完整，先以低成本实验补证据"],
    expected_effect: {}
  }, `fallback-${index + 1}`));
}

async function inBatches(items, limit, task) {
  const results = [];
  for (let index = 0; index < items.length; index += limit) {
    const slice = items.slice(index, index + limit);
    const settled = await Promise.allSettled(slice.map((item, offset) => task(item, index + offset)));
    results.push(...settled);
  }
  return results;
}

function candidatePrompt(context, meta) {
  const seen = (meta.seen || []).slice(-30).map((item) => ({
    bottleneck: item.candidate?.bottleneck || item.bottleneck,
    mechanism: item.candidate?.mechanism || item.mechanism,
    metric: item.candidate?.metric || item.metric,
    outcome: item.outcome || "generated"
  }));
  return [
    {
      role: "system",
      content: "你是餐饮经营方案搜索器。只返回一个JSON对象。方案必须便宜、可逆、可证伪，引用给定事实ID；不得把地图POI当人流，不得编造数字，不得直接裁具体员工。"
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "生成一个与已有机制不同的经营实验方案",
        required_schema: {
          bottleneck: "string", mechanism: "string", hypothesis: "string",
          evidence_refs: ["fact-id"], action: "string", budget_cap: 0,
          duration_days: 3, metric: "string", success_line: "string",
          stop_line: "string", reversibility: "high|medium|low",
          expected_effect: {}, assumptions: [], contraindications: [],
          falsification: "string", domain: meta.domain
        },
        search_round: meta.round,
        search_intent: meta.intent,
        preferred_domain: meta.domain,
        facts: context.facts,
        deterministic_decision: {
          decision: context.decision,
          title: context.title,
          reason: context.reason,
          metrics: context.metrics
        },
        existing_solutions: seen
      })
    }
  ];
}

function verifierPrompt(kind, context, candidate) {
  const criteria = VERIFY_CRITERIA[kind];
  return [
    {
      role: "system",
      content: "你是严格核验器，不提出新方案。只返回JSON：pass布尔值；criteria必须逐项包含要求的全部键及0-100有限分数；reasons必须至少写一条具体核验依据；fatal_errors必须是字符串数组。缺一项就视为核验失败。"
    },
    {
      role: "user",
      content: JSON.stringify({
        verifier: kind,
        criteria,
        facts: context.facts,
        deterministic_result: {
          decision: context.decision,
          metrics: context.metrics
        },
        candidate
      })
    }
  ];
}

function normalizeVerification(raw, kind) {
  const expectedCriteria = VERIFY_CRITERIA[kind] || [];
  const schemaErrors = [];
  if (!isPlainObject(raw)) schemaErrors.push("核验结果不是JSON对象");
  if (typeof raw?.pass !== "boolean") schemaErrors.push("缺少布尔值 pass");
  if (!isPlainObject(raw?.criteria)) schemaErrors.push("criteria 不是对象");
  if (!Array.isArray(raw?.reasons)
    || !raw.reasons.length
    || raw.reasons.some((item) => typeof item !== "string" || !item.trim())) {
    schemaErrors.push("reasons 必须包含至少一条具体依据");
  }
  if (!Array.isArray(raw?.fatal_errors)
    || raw.fatal_errors.some((item) => typeof item !== "string" || !item.trim())) {
    schemaErrors.push("fatal_errors 必须是字符串数组");
  }

  const scores = {};
  for (const criterion of expectedCriteria) {
    const value = raw?.criteria?.[criterion];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
      schemaErrors.push(`criteria 缺少有效评分：${criterion}`);
    } else {
      scores[criterion] = value;
    }
  }
  const values = Object.values(scores);
  const fatalErrors = Array.isArray(raw?.fatal_errors)
    ? raw.fatal_errors.map((item) => compact(item)).filter(Boolean).slice(0, 8)
    : [];
  return {
    kind,
    pass: raw?.pass === true && !fatalErrors.length && !schemaErrors.length,
    score: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
    criteria: scores,
    reasons: Array.isArray(raw?.reasons)
      ? raw.reasons.map((item) => compact(item)).filter(Boolean).slice(0, 8)
      : [],
    fatal_errors: [...schemaErrors, ...fatalErrors].slice(0, 16),
    schema_valid: schemaErrors.length === 0,
    technical_failure: schemaErrors.length > 0,
    degraded: false,
    source: "stepfun-verifier"
  };
}

function degradedVerification(kind, candidate, context, reason) {
  const gate = hardGate(candidate, context);
  const lowRiskExperiment = (
    gate.pass
    && candidate.reversibility === "high"
    && candidate.budget_cap === 0
    && candidate.duration_days <= 7
  );
  const values = kind === "evidence"
    ? [68, 55, 52, 50, 72, 62]
    : [70, 78, 72, 58, 82, 80, 70];
  const criteria = Object.fromEntries(
    (VERIFY_CRITERIA[kind] || []).map((criterion, index) => [criterion, values[index] || 50])
  );
  const technicalReason = compact(reason || "核验Agent返回了不可解析结果");
  return {
    kind,
    pass: lowRiskExperiment,
    score: values.reduce((sum, value) => sum + value, 0) / values.length,
    criteria,
    reasons: [
      `核验Agent技术失败：${technicalReason}`,
      lowRiskExperiment
        ? "仅按程序化硬门槛将其保留为低置信度、零预算、可逆补证据实验"
        : "程序化硬门槛或低风险条件未通过，不能进入候选结果"
    ],
    fatal_errors: lowRiskExperiment ? [] : gate.reasons,
    schema_valid: false,
    technical_failure: true,
    degraded: true,
    source: "programmatic-degraded-verifier",
    confidence: "low"
  };
}

function scoreCandidate(candidate, evidence, execution) {
  const evidenceValues = evidence.criteria || {};
  const executionValues = execution.criteria || {};
  const first = (object, patterns, fallback) => {
    const entry = Object.entries(object).find(([key]) => patterns.some((pattern) => key.includes(pattern)));
    return entry ? finite(entry[1], fallback) : fallback;
  };
  const parts = {
    traceability: first(evidenceValues, ["事实", "引用", "证据"], evidence.score) * 0.20,
    bottleneck: first(evidenceValues, ["断点", "瓶颈"], evidence.score) * 0.20,
    causality: first(evidenceValues, ["因果", "替代", "证伪"], evidence.score) * 0.15,
    impact: first(executionValues, ["改善", "影响"], execution.score) * 0.10,
    safety: first(executionValues, ["预算", "安全", "可逆"], execution.score) * 0.15,
    measurable: first(evidenceValues, ["实验", "测量"], evidence.score) * 0.10,
    executable: first(executionValues, ["执行", "场地", "期限"], execution.score) * 0.10
  };
  let score = Object.values(parts).reduce((sum, value) => sum + value, 0);
  if (evidence.degraded || execution.degraded) score = Math.min(score, 65);
  return { score: Math.round(score * 10) / 10, score_breakdown: parts };
}

export function createSearchState(options = {}) {
  const target = Math.max(1, Math.min(3, Math.round(finite(options.target, 3))));
  return {
    target,
    maxAttempts: target,
    attempts: 0,
    round: 0,
    audited: [],
    rejected: [],
    seen: [],
    verified: [],
    degradations: []
  };
}

export async function runAgentRound(context, previousState, options = {}) {
  const llm = options.llm;
  const concurrency = Math.max(1, Math.min(3, options.concurrency || 3));
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
  if (typeof llm !== "function") throw new Error("Agent round requires an LLM function");
  const state = JSON.parse(JSON.stringify(previousState || createSearchState(options)));
  state.target = Math.max(1, Math.min(3, Math.round(finite(state.target, 3))));
  state.maxAttempts = state.target;
  const target = state.target;
  const round = state.round + 1;
  const intents = [
    "广泛探索不同经营杠杆",
    "补足未覆盖机制",
    "攻击高分方案的隐藏假设",
    "改进最好机制并寻找更便宜版本"
  ];

  if (round <= Math.ceil(target / 5) && state.audited.length < target) {
    const roundTarget = Math.min(5, target - state.audited.length);
    const roundCandidates = [];
    state.degradations ||= [];
    const startAttempt = state.attempts;
    const jobs = Array.from({ length: roundTarget }, (_, index) => ({
      round,
      intent: intents[Math.min(round - 1, intents.length - 1)],
      domain: DOMAINS[(startAttempt + index) % DOMAINS.length],
      seen: state.seen
    }));
    state.attempts += jobs.length;
    onProgress({
      phase: "generate",
      round,
      completed: state.audited.length,
      target
    });
    const generated = await inBatches(jobs, concurrency, async (meta, jobIndex) => {
      const raw = await llm(candidatePrompt(context, meta), {
        temperature: round === 1 ? 0.85 : 0.65,
        maxTokens: 1500
      });
      const validation = validateRawCandidate(raw);
      if (!validation.pass) return { raw, validation, candidate: null, jobIndex };
      const candidate = normalizeCandidate(
        { ...raw, search_round: round },
        `candidate-${startAttempt + jobIndex + 1}-${crypto.randomUUID().slice(0, 8)}`
      );
      candidate.origin = "stepfun-generator";
      candidate.degradations = [];
      return { raw, validation, candidate, jobIndex };
    });

    for (let index = 0; index < generated.length; index += 1) {
      const result = generated[index];
      const slot = startAttempt + index;
      let candidate = null;
      let degradationReason = "";
      if (result.status === "rejected") {
        degradationReason = `生成Agent技术失败：${compact(result.reason?.message || result.reason || "unknown")}`;
      } else if (!result.value.validation.pass) {
        degradationReason = `生成Agent结构无效：${result.value.validation.reasons.join("；")}`;
        state.rejected.push({
          phase: "raw-schema",
          reasons: result.value.validation.reasons,
          raw: result.value.raw
        });
      } else {
        candidate = result.value.candidate;
        const gate = hardGate(candidate, context);
        const duplicate = [...state.seen, ...roundCandidates]
          .some((item) => signature(item.candidate || item) === signature(candidate));
        if (!gate.pass || duplicate) {
          degradationReason = duplicate
            ? "生成Agent方案与已有方案重复"
            : `生成Agent方案未通过硬门槛：${gate.reasons.join("；")}`;
          state.rejected.push({
            candidate,
            phase: duplicate ? "duplicate" : "hard-gate",
            reasons: duplicate ? ["与已有方案重复"] : gate.reasons
          });
          candidate = null;
        }
      }

      if (!candidate) {
        const used = new Set(
          [...state.seen, ...roundCandidates]
            .map((item) => signature(item.candidate || item))
        );
        for (let offset = 0; offset < SAFETY_BACKFILL_TEMPLATES.length; offset += 1) {
          const backfillSlot = (slot + offset) % SAFETY_BACKFILL_TEMPLATES.length;
          const replacement = safetyBackfillCandidate(context, backfillSlot, round, degradationReason);
          if (!used.has(signature(replacement))) {
            candidate = replacement;
            break;
          }
        }
        // There are more distinct templates than the three production audit slots.
        if (!candidate) throw new Error("安全回填方案空间不足");
        const event = {
          phase: "generation-backfill",
          round,
          slot: slot + 1,
          candidateId: candidate.id,
          reason: degradationReason
        };
        state.degradations.push(event);
        state.rejected.push(event);
      }
      roundCandidates.push(candidate);
    }

    onProgress({
      phase: "verify-evidence",
      round,
      completed: state.audited.length,
      target
    });
    const evidenceResults = await inBatches(roundCandidates, concurrency, async (candidate) => {
      const raw = await llm(verifierPrompt("evidence", context, candidate), {
        temperature: 0.1,
        maxTokens: 900
      });
      return normalizeVerification(raw, "evidence");
    });

    onProgress({
      phase: "verify-execution",
      round,
      completed: state.audited.length,
      target
    });
    const executionResults = await inBatches(roundCandidates, concurrency, async (candidate) => {
      const raw = await llm(verifierPrompt("execution", context, candidate), {
        temperature: 0.1,
        maxTokens: 900
      });
      return normalizeVerification(raw, "execution");
    });

    for (let index = 0; index < roundCandidates.length; index += 1) {
      const candidate = roundCandidates[index];
      const evidenceSettled = evidenceResults[index];
      const executionSettled = executionResults[index];
      const evidence = evidenceSettled?.status === "fulfilled"
        && !evidenceSettled.value.technical_failure
        ? evidenceSettled.value
        : degradedVerification(
          "evidence",
          candidate,
          context,
          evidenceSettled?.status === "fulfilled"
            ? evidenceSettled.value.fatal_errors.join("；")
            : compact(evidenceSettled?.reason?.message || evidenceSettled?.reason || "unknown")
        );
      const execution = executionSettled?.status === "fulfilled"
        && !executionSettled.value.technical_failure
        ? executionSettled.value
        : degradedVerification(
          "execution",
          candidate,
          context,
          executionSettled?.status === "fulfilled"
            ? executionSettled.value.fatal_errors.join("；")
            : compact(executionSettled?.reason?.message || executionSettled?.reason || "unknown")
        );
      if (evidence.degraded || execution.degraded) {
        const event = {
          phase: "verifier-degradation",
          round,
          candidateId: candidate.id,
          evidence: evidence.degraded,
          execution: execution.degraded,
          reason: [...evidence.reasons, ...execution.reasons].join("；")
        };
        state.degradations.push(event);
        candidate.degradations ||= [];
        candidate.degradations.push("至少一个核验Agent技术失败，结果仅按低置信度程序规则保留");
      }
      const score = scoreCandidate(candidate, evidence, execution);
      const programmatic = programmaticGate(candidate, context);
      const gate = hardGate(candidate, context);
      const audit = {
        candidate,
        round,
        pass: gate.pass && evidence.pass && execution.pass,
        ...score,
        verification: { hard_gate: gate, programmatic, evidence, execution }
      };
      state.audited.push(audit);
      if (audit.pass) {
        state.verified.push({ ...candidate, ...score, verification: audit.verification });
        state.seen.push({ candidate, outcome: `passed:${score.score}` });
      } else {
        const entry = {
          candidate,
          phase: "verification",
          verification: audit.verification,
          reasons: [...evidence.fatal_errors, ...execution.fatal_errors, ...evidence.reasons, ...execution.reasons]
        };
        state.rejected.push(entry);
        state.seen.push({ candidate, outcome: "verification-rejected" });
      }
    }
    onProgress({
      phase: "round-complete",
      round,
      completed: state.audited.length,
      target,
      passed: state.verified.length
    });
  }

  state.round = round;
  return state;
}

export function finalizeAgentSearch(context, state) {
  const target = Math.max(1, Math.min(3, Math.round(finite(state?.target, 3))));
  const audited = state?.audited || [];
  const rejected = state?.rejected || [];
  const verified = [...(state?.verified || [])];
  const degradations = state?.degradations || [];

  verified.sort((a, b) => b.score - a.score);
  const top3 = [];
  const signatures = new Set();
  for (const candidate of verified) {
    const key = signature(candidate);
    if (signatures.has(key)) continue;
    signatures.add(key);
    top3.push(candidate);
    if (top3.length === 3) break;
  }

  if (!top3.length) {
    return {
      mode: "deterministic-fallback",
      requested: target,
      generated: audited.length,
      verified: 0,
      audited,
      rejected,
      top3: [],
      evidence_tasks: fallbackCandidates(context),
      degraded: degradations.length > 0,
      degradations
    };
  }

  return {
    mode: "stepfun-search",
    requested: target,
    generated: audited.length,
    verified: verified.length,
    audited,
    rejected,
    top3,
    evidence_tasks: [],
    degraded: degradations.length > 0,
    degradations
  };
}

export async function runAgentSearch(context, options = {}) {
  const llm = options.llm;
  if (typeof llm !== "function") {
    return {
      mode: "deterministic-fallback",
      requested: Math.max(1, Math.min(3, Math.round(finite(options.target, 3)))),
      generated: 0,
      verified: 0,
      audited: [],
      rejected: [],
      top3: [],
      evidence_tasks: fallbackCandidates(context),
      degraded: true,
      degradations: [{
        phase: "analysis-fallback",
        reason: "StepFun不可用，未运行3方案搜索与双核验"
      }]
    };
  }
  let state = createSearchState(options);
  while (state.round < Math.ceil(state.target / 5) && state.audited.length < state.target) {
    state = await runAgentRound(context, state, options);
  }
  return finalizeAgentSearch(context, state);
}

export const orchestratorInternals = {
  finite,
  validateRawCandidate,
  normalizeCandidate,
  normalizeVerification,
  degradedVerification,
  factRangeLowerBound,
  expectedEffectGate,
  programmaticGate,
  hardGate,
  signature,
  safetyBackfillCandidate,
  fallbackCandidates,
  inBatches
};
