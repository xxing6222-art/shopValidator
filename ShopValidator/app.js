const $ = (id) => document.getElementById(id);
const money = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
const FLOW_ORDER = ["location", "interview", "review", "result"];
// fun-asr-flash accepts a complete short audio file rather than a live stream.
// The microphone stays open, while this client-side VAD cuts one answer after
// a short silence and sends only that in-memory WAV file to the Worker.
const LOCAL_VAD_SILENCE_MS = 350;
const LOCAL_VAD_PRE_ROLL_MS = 280;
const LOCAL_VAD_MAX_SEGMENT_MS = 20_000;
const DEMO_ORIGIN = "https://storevalidator.zhangyvjing.com/demo";
const PUBLIC_CASE_MATCH = window.location.pathname.match(/^\/case\/([A-Za-z0-9_-]+)\/?$/);
const PUBLIC_CASE_ID = PUBLIC_CASE_MATCH?.[1] || null;
const PUBLIC_CASE_MODE = Boolean(PUBLIC_CASE_ID);
const DEMO_MODE = ["/demo", "/demo/"].includes(window.location.pathname)
  || ["demo.shopvalidator.zhangyvjing.com"].includes(window.location.hostname)
  || new URLSearchParams(window.location.search).get("demo") === "1";
const DEMO_TURN_MS = Math.max(40, Number(new URLSearchParams(window.location.search).get("demoSpeed")) || 4000);
const DEMO_CHAR_MS = DEMO_TURN_MS < 100 ? 0 : 16;

const state = {
  panel: "location",
  productView: PUBLIC_CASE_MODE ? "result" : (DEMO_MODE ? "workspace" : "landing"),
  stage: null,
  caseId: null,
  caseToken: null,
  caseVersion: 1,
  firstQuestion: null,
  localMode: false,
  locationAttempt: 0,
  locationCandidate: null,
  locationConfirmed: false,
  mapContextLoaded: false,
  mapPicker: {
    center: null,
    point: null,
    zoom: 16,
    requestVersion: 0
  },
  interview: {
    active: false,
    paused: false,
    complete: false,
    questionIndex: -1,
    turnId: null,
    mode: "pending",
    transcript: "",
    draft: "",
    draftEdited: false,
    draftSource: "",
    voiceBase: "",
    progress: { asked: 0, coreTarget: 6, maxTurns: 12 },
    noSpeechCount: 0,
    submitInFlight: false,
    busy: false,
    asrController: null,
    turnController: null,
    finishRequested: false,
    pendingQuestion: null,
    history: []
  },
  facts: [],
  transcripts: [],
  reviewSubmitted: false,
  audio: null,
  recognition: null,
  ttsAudio: null,
  ttsController: null,
  analysisTimer: null,
  analysisFloor: 0,
  demoMode: DEMO_MODE,
  demoPlaybackToken: 0,
  publicShare: null
};

const QUESTION_BANK = {
  operating: [
    ["goal", "你现在最想解决什么：亏损、没客人，还是想增长？", "text", "经营目标"],
    ["monthlyRevenue", "这家店一个月大约收多少钱？", "money", "月营业额"],
    ["ordersDaily", "普通一天大约有多少单？", "count", "日订单量"],
    ["avgTicket", "每一单平均大约多少钱？", "money", "平均客单价"],
    ["variableCostRate", "每收一百元，食材平台和包装大约花多少？", "rate", "每百元变动成本"],
    ["rent", "房租和物业平均每个月多少钱？", "money", "月租金及物业"],
    ["labor", "所有员工工资每月一共多少？", "money", "月员工人工"],
    ["ownerReplacementWage", "如果请人替代老板和家人，每月要付多少工资？", "money", "老板与家人替代工资"],
    ["staffCount", "现在一共有几个人长期在店里干活？", "count", "长期工作人员"],
    ["otherFixed", "水电营销和其他固定支出，每月大约多少？", "money", "其他月固定支出"],
    ["cashReserve", "现在还能拿出来撑这家店的现金有多少？", "money", "可用现金"],
    ["debt", "这家店现在还有多少债务或欠款？", "money", "店铺相关债务"],
    ["channel", "营业额主要来自堂食、外卖，还是别的渠道？", "text", "主要收入渠道"],
    ["trafficMatch", "店外经过的人，大部分会买你这类产品吗？", "choice", "目标客流匹配"],
    ["visibility", "从主要来路十秒内能看懂你卖什么和价格吗？", "choice", "门头可见与可理解"],
    ["retention", "买过的人，后来会再次回来吗？", "choice", "复购表现"],
    ["initialInvestment", "这家店最开始一共投了多少钱？", "money", "历史总投入"],
    ["lease", "现在租约还剩多久，提前退出要赔多少？", "text", "租约与退出约束"]
  ],
  growth: [
    ["goal", "你这次最想提升营业额、利润，还是再开一家？", "text", "增长目标"],
    ["monthlyRevenue", "这家店现在一个月大约收多少钱？", "money", "月营业额"],
    ["avgTicket", "平均每单大约多少钱？", "money", "平均客单价"],
    ["variableCostRate", "每收一百元，所有变动成本大约花多少？", "rate", "每百元变动成本"],
    ["rent", "房租物业平均每月多少钱？", "money", "月租金及物业"],
    ["labor", "所有员工工资每月一共多少？", "money", "月员工人工"],
    ["ownerReplacementWage", "老板和家人的劳动按市场价每月值多少？", "money", "老板与家人替代工资"],
    ["otherFixed", "其他固定开销每月多少？", "money", "其他月固定支出"],
    ["cashReserve", "可以安全拿来做增长实验的钱有多少？", "money", "可用现金"],
    ["capacity", "高峰期还能多接单吗，还是已经忙不过来？", "text", "产能瓶颈"],
    ["trafficMatch", "经过的人里，目标顾客比例高吗？", "choice", "目标客流匹配"],
    ["visibility", "门头和菜单能让人十秒内做决定吗？", "choice", "门头与菜单转化"],
    ["retention", "买过的人会稳定复购吗？", "choice", "复购表现"],
    ["channel", "增长主要想靠堂食、外卖，还是新渠道？", "text", "增长渠道"],
    ["commitment", "新增投入能不能单独撤回，不影响原店？", "choice", "新增投入可逆性"]
  ],
  preopen: [
    ["goal", "你准备自己开、接转让店，还是加盟？", "text", "开店方式"],
    ["plannedCommitment", "签约装修设备和加盟全部算上，要投多少钱？", "money", "计划总投入"],
    ["cashReserve", "不借新债，你现在能拿出多少现金？", "money", "可用现金"],
    ["debt", "为这家店还准备借多少钱？", "money", "计划负债"],
    ["rent", "房租物业平均到每个月多少钱？", "money", "月租金及物业"],
    ["labor", "计划雇用的员工每月工资一共多少？", "money", "计划月员工人工"],
    ["ownerReplacementWage", "你和家人的劳动按市场价每月值多少？", "money", "老板与家人替代工资"],
    ["otherFixed", "水电营销和其他固定支出每月多少？", "money", "其他月固定支出"],
    ["avgTicket", "计划平均每位顾客花多少钱？", "money", "计划客单价"],
    ["variableCostRate", "每收一百元，食材平台包装预计花多少？", "rate", "每百元变动成本"],
    ["transferFee", "转让费、加盟费和强制采购分别有多少？", "money", "转让加盟等费用"],
    ["lease", "租期、押金和提前退出条款是什么？", "text", "租约与退出约束"],
    ["trafficMatch", "这个位置经过的人真是你的目标顾客吗？", "choice", "目标客流匹配"],
    ["visibility", "顾客从主要来路能直接看到店和价格吗？", "choice", "门店可见性"],
    ["retention", "你做过真实收钱的试卖或预售吗？", "choice", "真实付费验证"]
  ]
};

const FACT_LABELS = Object.fromEntries(
  Object.values(QUESTION_BANK).flat().map(([id, , , label]) => [id, label])
);

// 已筛选字幕案例：BV15vrVBwEVP（勇哥餐饮创业说）。其中的“月营业额”
// 由“一天约 4000”按 30 天换算，所有原视频没有给出的字段都如实标未知。
const DEMO_CASE = {
  location: {
    source: "demo-subtitle",
    address: "山西省运城市稷山县城区主街",
    city: "运城市",
    district: "稷山县",
    nearbyCount: 6,
    places: [{ title: "县城主街餐饮带" }, { title: "周边居民区" }]
  },
  turns: [
    ["goal", "我想看看座位要不要再规划一下，外卖怎么上。"],
    ["monthlyRevenue", "一天大约四千，按一个月三十天大约十二万。"],
    ["variableCostRate", "毛利大约百分之四十五，所以变动成本大约百分之五十五。"],
    ["rent", "房租一年两万七，不是一个月。"],
    ["labor", "人工一个月一万九。"],
    ["ownerReplacementWage", "我不知道，没单独算老板和家人的工资。"],
    ["staffCount", "六个长期员工，还有两个小时工。"],
    ["otherFixed", "水电气一个月大约一万。"],
    ["cashReserve", "这个没细算过。"],
    ["debt", "我不知道，没有单独算过。"],
    ["channel", "堂食为主，外卖现在只能做随机搭配。"],
    ["lease", "房租已经交了一年，合同也签了一年。"]
  ]
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
  }[char]));
}

function setProductView(view, { scroll = false } = {}) {
  state.productView = view;
  document.body.dataset.productView = view;
  if (scroll) {
    const target = view === "landing" ? $("top") : $("judge");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function enterWorkspace() {
  setProductView("workspace");
  setPanel("location");
}

function setPanel(panel, { scroll = true } = {}) {
  state.panel = panel;
  document.querySelectorAll("[data-panel]").forEach((element) => {
    const active = element.dataset.panel === panel;
    element.hidden = !active;
    element.classList.toggle("active", active);
  });
  const activeIndex = FLOW_ORDER.indexOf(panel);
  document.querySelectorAll("[data-progress]").forEach((element) => {
    element.classList.toggle("active", FLOW_ORDER.indexOf(element.dataset.progress) <= activeIndex);
  });
  const titles = {
    location: "先确认店铺位置",
    interview: "答完这几题，拿到诊断",
    review: "只改明显不对的事实",
    result: "算账、搜索，再核验"
  };
  $("flowTitle").textContent = titles[panel];
  if (scroll) {
    document.querySelector(`[data-panel="${panel}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function setLocationStatus(kind, message) {
  const box = $("locationStatus");
  box.hidden = false;
  box.className = `location-status ${kind || ""}`.trim();
  box.setAttribute("role", kind === "error" ? "alert" : "status");
  box.querySelector("p").textContent = message;
}

function chooseStage(stage) {
  state.stage = stage;
  document.querySelectorAll("[data-stage]").forEach((button) => {
    button.classList.toggle("selected", button.dataset.stage === stage);
  });
  if (!DEMO_MODE) applyStageContext(stage);
  updateBeginState();
}

// Everything that changes with the chosen stage in the real (non-demo) judge
// flow lives here so switching stages stays consistent.
function applyStageContext(stage) {
  const isPreopen = stage === "preopen";
  $("beginInterview").textContent = isPreopen ? "下一步：生成选址报告" : "开始问诊并持续录音";
  // The Yuncheng Xiaowancai demo is a real operating store, so it only makes
  // sense as a shortcut for "已经营业" / "有利润，想增长", never for preopen.
  const demoLink = $("panelDemoLink");
  if (demoLink) demoLink.hidden = isPreopen;
  // "我不知道" (and the prefilled default address) only belong to the preopen
  // map report. An existing store must state a real category and address.
  const unknownChip = document.querySelector('[data-category="我不知道"]');
  if (unknownChip) unknownChip.hidden = !isPreopen;
  if (isPreopen) {
    if (!$("category").value.trim()) $("category").value = "我不知道";
    if (!$("manualLocation").value.trim()) $("manualLocation").value = DEFAULT_STORE_ADDRESS;
  } else {
    if ($("category").value.trim() === "我不知道") $("category").value = "";
    if ($("manualLocation").value.trim() === DEFAULT_STORE_ADDRESS) {
      $("manualLocation").value = "";
      clearConfirmedLocation();
    }
  }
  syncCategoryChips();
}

// Reset a location that was confirmed via the preopen default address, so
// switching to an existing-store stage forces a fresh, real location.
function clearConfirmedLocation() {
  state.locationConfirmed = false;
  state.locationCandidate = null;
  state.mapPicker.center = null;
  state.mapPicker.point = null;
  $("mapSummary").hidden = true;
  $("mapPicker").hidden = true;
  $("locationProof").hidden = true;
  $("locationPanel").classList.remove("location-confirmed");
  $("confirmLocation").disabled = false;
  $("confirmLocation").textContent = "这是正确位置";
}

function syncCategoryChips() {
  const value = $("category").value.trim();
  document.querySelectorAll("[data-category]").forEach((button) => {
    button.classList.toggle("selected", button.dataset.category === value);
  });
  updateCategoryInputVisibility(value);
}

// "我不知道" means the user has no category yet, so the free-text input is
// meaningless and only adds noise. Hide it in that single case; every other
// selection (chip or typed) keeps the input visible.
function updateCategoryInputVisibility(value) {
  const field = document.querySelector(".category-input-field");
  if (field) field.hidden = value === "我不知道";
}

// First-load / reset defaults for the real (non-demo) judge flow: preopen stage
// with "我不知道" + the default store address, so a walk-in user can go straight
// to a map report. chooseStage → applyStageContext applies all of it.
function applyDefaultJudgeSetup() {
  if (DEMO_MODE) return;
  chooseStage("preopen");
}

function configureDemoLanding() {
  if (!DEMO_MODE) return;
  setProductView("workspace");
  document.body.classList.add("demo-mode");
  chooseStage("operating");
  $("category").value = "私房小碗菜";
  syncCategoryChips();
  $("locateButton").querySelector("b").textContent = "获取案例地图信息";
  $("locateButton").querySelector("small").textContent = "载入运城小碗菜的真实字幕记录";
  $("beginInterview").textContent = "下一步：用运城小碗菜数据分析";
  setLocationStatus("notice", "使用运城小碗菜的真实记录：点击获取地图信息后，按原流程继续。\n");
}

function updateBeginState() {
  $("beginInterview").disabled = !(state.stage && state.locationConfirmed);
}

function mapContextToCandidate(data, source) {
  const context = data.context || {};
  const location = context.location || {};
  const nearby = context.nearby || {};
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  // Coordinates are needed only while the user is looking at the map. Keep
  // them out of the context that later becomes the private D1 case snapshot.
  const persistedLocation = { ...location };
  delete persistedLocation.latitude;
  delete persistedLocation.longitude;
  const persistedContext = { ...context, location: persistedLocation };
  return {
    source,
    address: location.address || $("manualLocation").value.trim() || "已取得当前位置",
    city: location.city || "",
    district: location.district || "",
    nearbyCount: Number.isFinite(nearby.count) ? nearby.count : null,
    places: [...(nearby.places || []), ...(context.landmarks || [])],
    context: persistedContext,
    coordinates: Number.isFinite(latitude) && Number.isFinite(longitude)
      ? { latitude, longitude, coordinateSystem: context.coordinateSystem || "GCJ-02" }
      : null
  };
}

const MAP_PICKER_SIZE = { width: 640, height: 360 };

function isUsableCoordinate(point) {
  return Number.isFinite(Number(point?.latitude)) && Number.isFinite(Number(point?.longitude))
    && Math.abs(Number(point.latitude)) <= 90 && Math.abs(Number(point.longitude)) <= 180;
}

function projectMapPoint(point, zoom) {
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, Number(point.latitude)));
  const world = 256 * (2 ** zoom);
  const x = ((Number(point.longitude) + 180) / 360) * world;
  const radians = latitude * Math.PI / 180;
  const y = (1 - Math.asinh(Math.tan(radians)) / Math.PI) * world / 2;
  return { x, y };
}

function unprojectMapPoint(x, y, zoom) {
  const world = 256 * (2 ** zoom);
  const longitude = (x / world) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y / world);
  const latitude = 180 / Math.PI * Math.atan(Math.sinh(n));
  return { latitude, longitude, coordinateSystem: "GCJ-02" };
}

function formatPickerCoordinate(point) {
  if (!isUsableCoordinate(point)) return "等待地图位置";
  return `${Number(point.latitude).toFixed(5)}, ${Number(point.longitude).toFixed(5)}`;
}

function positionPickerPin() {
  const pin = $("mapPickerPin");
  const center = state.mapPicker.center;
  const point = state.mapPicker.point;
  if (!isUsableCoordinate(center) || !isUsableCoordinate(point)) return;
  const centerPx = projectMapPoint(center, state.mapPicker.zoom);
  const pointPx = projectMapPoint(point, state.mapPicker.zoom);
  const x = 50 + ((pointPx.x - centerPx.x) / MAP_PICKER_SIZE.width) * 100;
  const y = 50 + ((pointPx.y - centerPx.y) / MAP_PICKER_SIZE.height) * 100;
  pin.style.left = `${Math.max(-4, Math.min(104, x))}%`;
  pin.style.top = `${Math.max(-4, Math.min(104, y))}%`;
}

function showMapPicker(candidate) {
  const coordinates = candidate?.coordinates;
  if (!isUsableCoordinate(coordinates)) {
    $("mapPicker").hidden = true;
    return;
  }
  const center = { ...coordinates };
  state.mapPicker.center = center;
  state.mapPicker.point = { ...center };
  const requestVersion = ++state.mapPicker.requestVersion;
  const image = $("mapPickerImage");
  image.src = `/api/map/static?lat=${encodeURIComponent(Number(center.latitude).toFixed(6))}&lng=${encodeURIComponent(Number(center.longitude).toFixed(6))}&zoom=${state.mapPicker.zoom}&v=${requestVersion}`;
  $("mapPickerCoordinate").textContent = `已定位：${formatPickerCoordinate(center)} · 可点击微调`;
  $("useMapPickerPoint").disabled = false;
  $("mapPicker").hidden = false;
  positionPickerPin();
  requestAnimationFrame(() => $("mapPicker").scrollIntoView({ behavior: "smooth", block: "center" }));
}

function chooseMapPickerPoint(event) {
  const canvas = $("mapPickerCanvas");
  const center = state.mapPicker.center;
  if (!isUsableCoordinate(center)) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = ((event.clientX - rect.left) / rect.width) * MAP_PICKER_SIZE.width;
  const y = ((event.clientY - rect.top) / rect.height) * MAP_PICKER_SIZE.height;
  const centerPx = projectMapPoint(center, state.mapPicker.zoom);
  state.mapPicker.point = unprojectMapPoint(
    centerPx.x + (x - MAP_PICKER_SIZE.width / 2),
    centerPx.y + (y - MAP_PICKER_SIZE.height / 2),
    state.mapPicker.zoom
  );
  $("mapPickerCoordinate").textContent = `已选图钉：${formatPickerCoordinate(state.mapPicker.point)}`;
  $("useMapPickerPoint").disabled = false;
  positionPickerPin();
}

async function useMapPickerPoint() {
  const point = state.mapPicker.point;
  if (!isUsableCoordinate(point)) return;
  const attempt = ++state.locationAttempt;
  $("useMapPickerPoint").disabled = true;
  setLocationStatus("loading", "正在读取图钉位置的地址和周边…");
  try {
    const params = new URLSearchParams({
      lat: Number(point.latitude).toFixed(6),
      lng: Number(point.longitude).toFixed(6),
      category: mapScanCategory()
    });
    if (isSiteReportMode()) params.set("rich", "1");
    const data = await fetchJson(`/api/map/pick-context?${params}`);
    if (attempt !== state.locationAttempt) return;
    state.mapContextLoaded = true;
    renderMapCandidate(mapContextToCandidate(data, "map-picker"));
    setLocationStatus("notice", "已按图钉更新位置，请确认是不是店铺门口。");
  } catch (error) {
    if (attempt !== state.locationAttempt) return;
    setLocationStatus("error", error.message || "图钉位置暂时无法解析，请重新选择。");
  } finally {
    $("useMapPickerPoint").disabled = false;
  }
}

function renderMapCandidate(candidate) {
  state.locationCandidate = candidate;
  $("mapAddress").textContent = candidate.address;
  $("mapDistrict").textContent = [candidate.city, candidate.district].filter(Boolean).join(" · ") || "位置待你确认";
  $("mapCompetitors").textContent = Number.isFinite(candidate.nearbyCount) ? `${candidate.nearbyCount} 个` : "未读取";
  const names = candidate.places
    .map((item) => item.title || item)
    .filter((name, index, all) => name && all.indexOf(name) === index)
    .slice(0, 7);
  $("nearbyTags").innerHTML = names.length
    ? names.map((name) => `<span>${escapeHtml(name)}</span>`).join("")
    : "<span>周边数据未参与判断</span>";
  $("mapSummary").hidden = false;
  showMapPicker(candidate);
}

function confirmLocation() {
  if (!state.locationCandidate) return;
  state.locationConfirmed = true;
  $("locationProof").hidden = false;
  $("locationProofText").textContent = state.locationCandidate.address;
  $("locationPanel").classList.add("location-confirmed");
  $("confirmLocation").textContent = "位置已确认";
  $("confirmLocation").disabled = true;
  setLocationStatus("success", "位置已由你确认，可以开始问诊。");
  upsertFact({
    id: "location",
    label: "店铺位置",
    kind: "text",
    value: state.locationCandidate.address,
    status: "confirmed",
    source: "map",
    evidence: state.locationCandidate.source === "manual-unverified" ? "C" : "B"
  });
  updateBeginState();
}

function editLocation() {
  state.locationConfirmed = false;
  $("locationProof").hidden = true;
  $("locationPanel").classList.remove("location-confirmed");
  $("confirmLocation").disabled = false;
  $("confirmLocation").textContent = "这是正确位置";
  updateBeginState();
}

async function fetchJson(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const externalSignal = options.signal;
  const abortFromCaller = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromCaller();
  else externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || `请求失败（${response.status}）`);
      error.status = response.status;
      error.code = data.code;
      if (Number.isInteger(data.version)) error.caseVersion = data.version;
      if (data.nextQuestion) error.nextQuestion = data.nextQuestion;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }
}

// Preopen (non-demo) goes straight to a map-driven site report instead of the
// financial interview, so it needs the richer environment scan.
function isSiteReportMode() {
  return !DEMO_MODE && state.stage === "preopen";
}

// The map scan always needs a real keyword; "我不知道" and empty fall back to a
// generic food keyword so the nearby search still returns competitors.
function mapScanCategory() {
  const value = $("category").value.trim();
  return !value || value === "我不知道" ? "餐饮" : value;
}

async function fetchMapContext(latitude, longitude) {
  const params = new URLSearchParams({
    lat: latitude.toFixed(6),
    lng: longitude.toFixed(6),
    category: mapScanCategory()
  });
  if (isSiteReportMode()) params.set("rich", "1");
  return fetchJson(`/api/map/context?${params}`);
}

async function fetchAddressContext(address) {
  const params = new URLSearchParams({
    address,
    category: mapScanCategory()
  });
  if (isSiteReportMode()) params.set("rich", "1");
  return fetchJson(`/api/map/address-context?${params}`);
}

async function offerLocationFallback(reason, attempt) {
  // Any failure to obtain the user's own location (denied / timeout / misclick /
  // unsupported) drops to a known default store address so a walk-in user can
  // still click straight through to a report.
  await useDefaultLocation(reason, attempt);
}

const DEFAULT_STORE_ADDRESS = "浙江省杭州市余杭区礼贤路湖畔科创中心";
const DEFAULT_LOCATION_HINT = "由于系统设置而未获取您的地址，所以这里我们使用默认地址";

async function useDefaultLocation(reason, attempt) {
  if (attempt != null && attempt !== state.locationAttempt) return;
  $("manualLocation").value = DEFAULT_STORE_ADDRESS;
  setLocationStatus("notice", `${reason ? reason + " " : ""}${DEFAULT_LOCATION_HINT}。`);
  let candidate;
  try {
    const data = await fetchAddressContext(DEFAULT_STORE_ADDRESS);
    if (attempt != null && attempt !== state.locationAttempt) return;
    candidate = mapContextToCandidate(data, "default");
  } catch (_) {
    if (attempt != null && attempt !== state.locationAttempt) return;
    candidate = {
      source: "default",
      address: DEFAULT_STORE_ADDRESS,
      city: "杭州市",
      district: "余杭区",
      nearbyCount: null,
      places: []
    };
  }
  state.mapContextLoaded = true;
  renderMapCandidate(candidate);
  setLocationStatus("notice", `已为你定位到默认地址。可在地图点选店铺门口，再确认位置。${DEFAULT_LOCATION_HINT}。`);
  $("locateButton").disabled = false;
}

function locateCurrentStore() {
  if (DEMO_MODE) {
    void loadDemoLocation();
    return;
  }
  const attempt = ++state.locationAttempt;
  state.locationConfirmed = false;
  state.locationCandidate = null;
  $("locationProof").hidden = true;
  $("mapSummary").hidden = true;
  $("locateButton").disabled = true;
  updateBeginState();
  setLocationStatus("loading", "正在取得当前位置并读取腾讯地图周边…");
  if (!navigator.geolocation) {
    void offerLocationFallback("当前浏览器不支持精确定位。", attempt);
    return;
  }
  navigator.geolocation.getCurrentPosition(async (position) => {
    if (attempt !== state.locationAttempt) return;
    try {
      const data = await fetchMapContext(position.coords.latitude, position.coords.longitude);
      if (attempt !== state.locationAttempt) return;
      state.mapContextLoaded = true;
      renderMapCandidate(mapContextToCandidate(data, "gps"));
      setLocationStatus("notice", "地图已找到位置，请确认是不是这家店。");
    } catch (error) {
      renderMapCandidate({
        source: "gps-without-map",
        address: "精确坐标已取得，地图暂时无法解析",
        city: "",
        district: "",
        nearbyCount: null,
        places: []
      });
      setLocationStatus("notice", `${error.message}。你仍可确认坐标，或改用手动地址。`);
    } finally {
      $("locateButton").disabled = false;
    }
  }, (error) => {
    const labels = { 1: "没有取得精确定位权限。", 2: "暂时无法取得精确位置。", 3: "精确定位超时。" };
    void offerLocationFallback(labels[error.code] || "精确定位失败。", attempt);
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
}

async function loadDemoLocation() {
  $("locateButton").disabled = true;
  setLocationStatus("loading", "正在从字幕案例中载入位置与经营背景…");
  await new Promise((resolve) => setTimeout(resolve, 650));
  state.mapContextLoaded = true;
  renderMapCandidate(DEMO_CASE.location);
  confirmLocation();
  $("confirmLocation").hidden = true;
  setLocationStatus("success", "案例位置、经营阶段和品类已载入。点击下一步，观看完整问诊。 ");
  $("locateButton").disabled = false;
}

async function useManualLocation() {
  const address = $("manualLocation").value.trim();
  if (!address) {
    setLocationStatus("error", "请先写下城市、商圈或详细地址。");
    return;
  }
  const attempt = ++state.locationAttempt;
  state.locationConfirmed = false;
  $("locationProof").hidden = true;
  $("useManualLocation").disabled = true;
  updateBeginState();
  setLocationStatus("loading", "正在查找这个地址和周边地点…");
  try {
    const data = await fetchAddressContext(address);
    if (attempt !== state.locationAttempt) return;
    state.mapContextLoaded = true;
    renderMapCandidate(mapContextToCandidate(data, "address"));
    setLocationStatus("notice", "地图已找到地址，请确认是不是这家店。");
  } catch (error) {
    if (attempt !== state.locationAttempt) return;
    if (Number(error.status) >= 400 && Number(error.status) < 500) {
      setLocationStatus("error", error.message);
      return;
    }
    renderMapCandidate({
      source: "manual-unverified",
      address,
      city: "",
      district: "手动提供，地图未核验",
      nearbyCount: null,
      places: []
    });
    setLocationStatus("notice", "腾讯地图暂时不可用。已保留手动地址，请确认。");
  } finally {
    $("useManualLocation").disabled = false;
  }
}

function upsertFact(fact) {
  const existing = state.facts.findIndex((item) => item.id === fact.id);
  const definition = Object.values(QUESTION_BANK)
    .flat()
    .find(([id]) => id === fact.id);
  const next = {
    status: "provisional",
    source: "voice",
    evidence: "C",
    raw: "",
    kind: definition?.[2] || "text",
    label: definition?.[3] || FACT_LABELS[fact.id] || fact.field || fact.id,
    updatedAt: new Date().toISOString(),
    ...fact
  };
  next.field = next.field || next.id;
  next.evidenceGrade = next.evidenceGrade || next.evidence;
  next.rawTranscript = next.rawTranscript ?? next.raw;
  next.unit = next.unit || ({ money: "CNY", rate: "%", count: "count" })[next.kind] || null;
  if (existing >= 0) state.facts.splice(existing, 1, { ...state.facts[existing], ...next });
  else state.facts.push(next);
  return next;
}

function questionList() {
  return QUESTION_BANK[state.stage] || QUESTION_BANK.operating;
}

function questionAt(index) {
  const row = questionList()[index];
  return row ? { id: row[0], text: row[1], kind: row[2], label: row[3] } : null;
}

async function createCase() {
  const category = $("category").value.trim() || "餐饮";
  upsertFact({ id: "stage", label: "经营阶段", kind: "text", value: state.stage, status: "confirmed", source: "choice", evidence: "B" });
  upsertFact({ id: "category", label: "经营品类", kind: "text", value: category, status: "confirmed", source: "typed", evidence: "B" });
  try {
    const data = await fetchJson("/api/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        stage: state.stage,
        category,
        location: state.locationCandidate,
        clientVersion: "2.1"
      })
    }, 5000);
    state.caseId = data.caseId || data.id || data.case?.id;
    state.caseToken = data.caseToken || data.token || null;
    if (data.case?.version) state.caseVersion = data.case.version;
    if (!state.caseId) throw new Error("服务端没有返回案卷编号");
    if (!state.caseToken) throw new Error("服务端没有返回案卷令牌");
    state.localMode = false;
    // Forward the full map context (including the rich environment scan) when we
    // have it, so a site report can read the surroundings; otherwise fall back
    // to the minimal shape the interview flow always relied on.
    const candidateContext = state.locationCandidate?.context;
    const contextToSend = candidateContext && candidateContext.location?.address
      ? candidateContext
      : {
          location: {
            address: state.locationCandidate?.address || "",
            city: state.locationCandidate?.city || "",
            district: state.locationCandidate?.district || "",
            source: state.locationCandidate?.source || "unknown"
          },
          nearby: {
            count: state.locationCandidate?.nearbyCount,
            places: state.locationCandidate?.places || []
          }
        };
    const located = await fetchJson(`/api/cases/${encodeURIComponent(state.caseId)}/location`, {
      method: "POST",
      headers: caseHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        confirmed: true,
        context: contextToSend
      })
    }, 5000);
    state.firstQuestion = located.firstQuestion || null;
    if (located.interview) state.interview.progress = located.interview;
    if (located.version) state.caseVersion = located.version;
  } catch (_) {
    state.caseId = `local-${Date.now()}`;
    state.caseToken = null;
    state.localMode = true;
  }
}

function caseHeaders(extra = {}) {
  return state.caseToken ? { ...extra, "X-Case-Token": state.caseToken } : extra;
}

class ContinuousAudio {
  constructor(onSegment = null) {
    this.stream = null;
    this.context = null;
    this.processor = null;
    this.sendEnabled = false;
    this.onSegment = onSegment;
    this.preRoll = [];
    this.segmentChunks = [];
    this.preRollSamples = 0;
    this.segmentSamples = 0;
    this.speechDetected = false;
    this.silenceMs = 0;
    this.voiceMs = 0;
    this.noiseFloor = 0.004;
    this.noiseCalibrationMs = 0;
    this.noiseCalibrated = false;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false
    });
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    this.context = new AudioContextClass();
    await this.context.resume();
    const source = this.context.createMediaStreamSource(this.stream);
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    const silent = this.context.createGain();
    silent.gain.value = 0;
    this.processor.onaudioprocess = (event) => {
      const mono = event.inputBuffer.getChannelData(0);
      const samples = downsample(mono, this.context.sampleRate, 16000);
      if (!this.sendEnabled) {
        if (!this.noiseCalibrated) this.observeNoise(samples);
        return;
      }
      this.consume(samples);
    };
    source.connect(this.processor);
    this.processor.connect(silent);
    silent.connect(this.context.destination);
  }

  observeNoise(samples) {
    let energy = 0;
    for (const sample of samples) energy += sample * sample;
    const rms = Math.sqrt(energy / Math.max(1, samples.length));
    this.noiseFloor = Math.max(
      0.004,
      Math.min(0.03, (this.noiseFloor * 0.82) + (Math.min(rms, 0.03) * 0.18))
    );
    this.noiseCalibrationMs += (samples.length / 16000) * 1000;
    if (this.noiseCalibrationMs >= 400) this.noiseCalibrated = true;
  }

  consume(samples) {
    const frame = new Float32Array(samples);
    const frameMs = (frame.length / 16000) * 1000;
    let energy = 0;
    for (const sample of frame) energy += sample * sample;
    const rms = Math.sqrt(energy / Math.max(1, frame.length));

    if (!this.speechDetected) {
      this.noiseFloor = (this.noiseFloor * 0.96) + (Math.min(rms, 0.03) * 0.04);
      this.preRoll.push(frame);
      this.preRollSamples += frame.length;
      const maxPreRoll = Math.round((LOCAL_VAD_PRE_ROLL_MS / 1000) * 16000);
      while (this.preRollSamples > maxPreRoll && this.preRoll.length > 1) {
        this.preRollSamples -= this.preRoll.shift().length;
      }
    }

    const threshold = Math.max(0.012, this.noiseFloor * 2.4);
    const hasVoice = rms >= threshold;
    let startedNow = false;
    if (hasVoice && !this.speechDetected) {
      this.voiceMs += frameMs;
      if (this.voiceMs < 100) return;
    } else if (!hasVoice && !this.speechDetected) {
      this.voiceMs = 0;
    }
    if (hasVoice) {
      if (!this.speechDetected) {
        startedNow = true;
        this.speechDetected = true;
        this.segmentChunks.push(...this.preRoll);
        this.segmentSamples += this.preRollSamples;
        this.preRoll = [];
        this.preRollSamples = 0;
        setListening("live", "正在听你说话");
      }
      this.silenceMs = 0;
    } else if (this.speechDetected) {
      this.silenceMs += frameMs;
    }

    if (this.speechDetected && !startedNow) {
      this.segmentChunks.push(frame);
      this.segmentSamples += frame.length;
      const durationMs = (this.segmentSamples / 16000) * 1000;
      if (this.silenceMs >= LOCAL_VAD_SILENCE_MS || durationMs >= LOCAL_VAD_MAX_SEGMENT_MS) {
        this.finishSegment();
      }
    }
  }

  finishSegment() {
    if (!this.speechDetected || this.segmentSamples < 1600) {
      this.resetSegment();
      return;
    }
    const pcm = new Float32Array(this.segmentSamples);
    let offset = 0;
    for (const chunk of this.segmentChunks) {
      pcm.set(chunk, offset);
      offset += chunk.length;
    }
    const wav = floatSamplesToWav(pcm, 16000);
    this.sendEnabled = false;
    this.resetSegment();
    if (typeof this.onSegment === "function") void this.onSegment(wav);
  }

  resetSegment() {
    this.preRoll = [];
    this.segmentChunks = [];
    this.preRollSamples = 0;
    this.segmentSamples = 0;
    this.speechDetected = false;
    this.silenceMs = 0;
    this.voiceMs = 0;
  }

  setSending(enabled) {
    const next = Boolean(enabled);
    if (next !== this.sendEnabled) this.resetSegment();
    this.sendEnabled = next;
  }

  stop() {
    this.sendEnabled = false;
    if (this.processor) this.processor.disconnect();
    if (this.stream) this.stream.getTracks().forEach((track) => track.stop());
    if (this.context) void this.context.close();
    this.processor = null;
    this.stream = null;
    this.context = null;
    this.resetSegment();
  }
}

function downsample(buffer, inputRate, outputRate) {
  if (inputRate === outputRate) return buffer;
  const ratio = inputRate / outputRate;
  const length = Math.max(1, Math.round(buffer.length / ratio));
  const result = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(buffer.length, Math.floor((i + 1) * ratio));
    let total = 0;
    for (let j = start; j < end; j += 1) total += buffer[j];
    result[i] = total / Math.max(1, end - start);
  }
  return result;
}

function floatToPcm16(samples) {
  const output = new ArrayBuffer(samples.length * 2);
  const view = new DataView(output);
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true);
  }
  return output;
}

function floatSamplesToWav(samples, sampleRate = 16000) {
  const pcm = floatToPcm16(samples);
  const output = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(output);
  const write = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  new Uint8Array(output, 44).set(new Uint8Array(pcm));
  return output;
}

async function transcribeRecordedAnswer(wavBuffer) {
  if (!state.interview.active || state.interview.paused || state.interview.submitInFlight) return;
  if (!state.caseId || !state.caseToken) {
    state.audio?.stop();
    state.audio = null;
    activateLocalFallback("云端案卷没有建立成功，已切换到本机问诊。");
    return;
  }
  const snapshot = {
    turnId: state.interview.turnId,
    questionId: $("currentQuestion").dataset.factId,
    question: $("currentQuestion").textContent,
    caseVersion: state.caseVersion
  };
  state.interview.asrController?.abort();
  const controller = new AbortController();
  state.interview.asrController = controller;
  const timer = setTimeout(() => controller.abort(), 25_000);
  setListening("", "阿里云正在识别");
  $("liveTranscript").textContent = "回答已结束，正在识别…";
  try {
    const response = await fetch(`/api/cases/${encodeURIComponent(state.caseId)}/asr`, {
      method: "POST",
      headers: caseHeaders({
        "Content-Type": "audio/wav",
        "Accept": "application/json",
        "X-Turn-Id": snapshot.turnId,
        "X-Case-Version": String(snapshot.caseVersion)
      }),
      body: wavBuffer,
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `语音识别失败（${response.status}）`);
    if (!state.interview.active || state.interview.turnId !== snapshot.turnId || state.interview.submitInFlight) return;
    const transcript = String(data.text || "").trim();
    // A single-character transcript can be a complete, valid answer: most
    // importantly `0` for debt, cash, costs or planned borrowing.  Treat only
    // an empty transcription as missing; fact validation happens after the
    // user confirms the draft.
    if (!transcript) throw new Error("没有识别到有效回答");
    state.interview.transcript = transcript;
    setAnswerDraft(appendTranscript($("fallbackAnswer").value, transcript), "voice-final");
    $("liveTranscript").textContent = transcript;
    state.transcripts.push({ turnId: snapshot.turnId, text: transcript, question: snapshot.question });
    setListening("", "识别完成，请确认");
  } catch (error) {
    if (
      error?.name === "AbortError"
      || controller.signal.aborted
      || state.interview.asrController !== controller
      || !state.interview.active
      || state.interview.paused
      || state.interview.turnId !== snapshot.turnId
    ) return;
    enableTextFallback(`没有听清：${error.message}。请直接输入这一题。`);
  } finally {
    clearTimeout(timer);
    if (state.interview.asrController === controller) state.interview.asrController = null;
  }
}

async function submitRemoteTurn(transcript, snapshot = {}) {
  if (!state.caseId || !state.caseToken) return;
  if (state.interview.submitInFlight) return;
  const turnId = snapshot.turnId || state.interview.turnId;
  const controller = new AbortController();
  state.interview.turnController?.abort();
  state.interview.turnController = controller;
  state.interview.submitInFlight = true;
  state.audio?.setSending(false);
  setInterviewBusy(true);
  setListening("thinking", "正在整理你的回答");
  try {
    const data = await fetchJson(`/api/cases/${encodeURIComponent(state.caseId)}/turns`, {
      method: "POST",
      headers: caseHeaders({ "Content-Type": "application/json", "Accept": "application/json" }),
      body: JSON.stringify({
        turnId,
        questionId: snapshot.questionId || $("currentQuestion").dataset.factId,
        question: snapshot.question || $("currentQuestion").textContent,
        answer: transcript,
        source: snapshot.source || state.interview.draftSource || "typed",
        expectedVersion: snapshot.caseVersion ?? state.caseVersion
      }),
      signal: controller.signal
    }, 30000);
    if (
      controller.signal.aborted
      || state.interview.turnController !== controller
      || !state.interview.active
      || state.interview.turnId !== turnId
    ) return;
    if (Array.isArray(data.facts)) data.facts.forEach(upsertFact);
    if (Array.isArray(data.extractedFacts)) data.extractedFacts.forEach(upsertFact);
    if (data.fact) upsertFact(data.fact);
    if (data.version || data.case?.version) state.caseVersion = data.version || data.case.version;
    if (data.interview) state.interview.progress = data.interview;
    if (state.interview.finishRequested || data.complete || data.interviewComplete) {
      completeInterview();
      return;
    }
    const next = data.nextQuestion || data.question;
    if (next) {
      const pending = {
        id: next.factId || next.id || next.field,
        text: next.text,
        kind: next.kind || "text",
        label: next.label
      };
      const pendingIndex = Number.isFinite(next.index) ? next.index : state.interview.questionIndex + 1;
      if (state.interview.paused) {
        state.interview.pendingQuestion = { question: pending, index: pendingIndex };
        setListening("paused", "答案已保存，问诊已暂停");
      } else {
        askQuestion(pending, pendingIndex);
      }
    }
  } catch (error) {
    if (
      controller.signal.aborted
      || state.interview.turnController !== controller
      || !state.interview.active
    ) return;
    if (state.interview.finishRequested) {
      completeInterview();
      return;
    }
    if (
      (error?.code === "CASE_VERSION_CONFLICT" || error?.code === "TURN_CONFLICT")
      && error.nextQuestion
      && !error.nextQuestion.complete
    ) {
      // The case moved on without this submission (e.g. an earlier turn did
      // commit but its response was lost). Adopt the server's latest question
      // instead of retrying forever against a stale version.
      if (Number.isInteger(error.caseVersion)) state.caseVersion = error.caseVersion;
      const latest = error.nextQuestion;
      $("interviewNotice").textContent = "已同步到最新进度，这一题请再回答一次。";
      askQuestion({
        id: latest.field || latest.id,
        text: latest.text,
        kind: latest.kind || "text",
        label: latest.label
      }, state.interview.questionIndex + 1);
      return;
    }
    retryCurrentTurn(transcript, error);
  } finally {
    if (state.interview.turnController === controller) {
      state.interview.turnController = null;
      state.interview.submitInFlight = false;
    }
  }
}

function retryCurrentTurn(transcript, error) {
  state.interview.submitInFlight = false;
  state.interview.turnController = null;
  setInterviewBusy(false);
  if (transcript && $("fallbackAnswer").value.trim() !== transcript) {
    $("fallbackAnswer").value = transcript;
  }
  const detail = error?.message ? `：${error.message}` : "";
  $("interviewNotice").textContent = `网络有点慢，这一题的答案已保留，请再点一次“确认并下一题”重试${detail}`;
  setListening("paused", "请重试这一题");
  $("fallbackAnswer").focus();
}

function setListening(mode, label) {
  $("listeningPill").className = `listening-pill ${mode}`;
  $("listeningLabel").textContent = label;
}

function setInterviewBusy(busy) {
  state.interview.busy = Boolean(busy);
  const confirm = $("confirmAnswer");
  const previous = $("previousQuestion");
  const answer = $("fallbackAnswer");
  if (confirm) confirm.disabled = busy;
  if (previous) previous.disabled = busy || state.interview.questionIndex <= 0;
  if (answer) answer.disabled = busy;
}

async function speakQuestion(text, audioUrl = null) {
  const turnId = state.interview.turnId;
  // Late work from a previous turn (or anything resolving while the user is
  // submitting a manual answer) must never play or re-enable listening.
  const isStale = () => (
    state.interview.turnId !== turnId
    || state.interview.submitInFlight
    || !state.interview.active
  );
  state.audio?.setSending(false);
  stopRecognition();
  setListening("", "AI 正在提问");
  if (!audioUrl && !state.localMode && state.caseToken) {
    state.ttsController?.abort();
    const controller = new AbortController();
    state.ttsController = controller;
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: caseHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ caseId: state.caseId, text }),
        signal: controller.signal
      });
      if (response.ok && response.status !== 204) {
        const audio = await response.blob();
        if (audio.size > 0 && String(audio.type || "").startsWith("audio/")) {
          audioUrl = URL.createObjectURL(audio);
        }
      }
    } catch (_) {
      audioUrl = null;
    } finally {
      if (state.ttsController === controller) state.ttsController = null;
    }
  }
  if (isStale()) {
    if (audioUrl && String(audioUrl).startsWith("blob:")) URL.revokeObjectURL(audioUrl);
    return;
  }
  if (audioUrl) {
    const audio = new Audio(audioUrl);
    state.ttsAudio = audio;
    try {
      await audio.play();
      await new Promise((resolve) => {
        audio.onended = resolve;
        audio.onerror = resolve;
      });
    } catch (_) {
      // Text remains visible if audio playback is unavailable.
    } finally {
      if (state.ttsAudio === audio) state.ttsAudio = null;
      if (String(audioUrl).startsWith("blob:")) URL.revokeObjectURL(audioUrl);
    }
  } else if ("speechSynthesis" in window) {
    await new Promise((resolve) => {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "zh-CN";
      utterance.rate = 1.15;
      utterance.onend = resolve;
      utterance.onerror = resolve;
      window.speechSynthesis.speak(utterance);
    });
  }
  if (state.interview.paused || isStale()) return;
  state.audio?.setSending(state.interview.mode === "dashscope-http");
  setListening("live", "正在听你说话");
  if (state.interview.mode === "local-speech") startRecognition();
}

function askQuestion(question, index = null) {
  if (!question) {
    finishInterview();
    return;
  }
  if (Number.isFinite(index)) state.interview.questionIndex = index;
  state.interview.history[state.interview.questionIndex] = question;
  $("previousQuestion").disabled = state.interview.questionIndex <= 0;
  state.interview.turnId = crypto.randomUUID ? crypto.randomUUID() : `turn-${Date.now()}`;
  state.interview.transcript = "";
  state.interview.draft = "";
  state.interview.draftEdited = false;
  state.interview.draftSource = "";
  state.interview.voiceBase = "";
  $("fallbackAnswer").value = "";
  $("liveTranscript").textContent = "停顿后，整段识别结果会显示在这里";
  $("currentQuestion").textContent = question.text;
  $("currentQuestion").dataset.factId = question.id;
  $("currentQuestion").dataset.factKind = question.kind || "text";
  $("currentQuestion").dataset.factLabel = question.label || FACT_LABELS[question.id] || "事实";
  const current = Math.max(1, state.interview.questionIndex + 1);
  $("questionProgress").textContent = `${current}/12`;
  setInterviewBusy(false);
  void speakQuestion(question.text, question.audioUrl);
}

function goToPreviousQuestion() {
  if (!state.interview.active || state.interview.questionIndex <= 0) return;
  const prevIndex = state.interview.questionIndex - 1;
  const previous = state.interview.history[prevIndex] || questionAt(prevIndex);
  if (!previous) return;
  state.interview.asrController?.abort();
  state.interview.asrController = null;
  state.interview.turnController?.abort();
  state.interview.turnController = null;
  state.interview.submitInFlight = false;
  state.interview.pendingQuestion = null;
  stopVoiceIo();
  state.transcripts.pop();
  if (state.interview.progress?.asked > 0) state.interview.progress.asked -= 1;
  askQuestion(previous, prevIndex);
}

function startRecognition() {
  if (!state.recognition || !state.interview.active || state.interview.paused) return;
  state.interview.voiceBase = $("fallbackAnswer").value;
  try { state.recognition.start(); } catch (_) { /* Already running. */ }
}

function stopRecognition() {
  if (!state.recognition) return;
  try { state.recognition.stop(); } catch (_) { /* Already stopped. */ }
}

// Cut every voice input/output channel immediately. Used when the user takes
// over manually (confirm/previous): in-flight ASR/TTS responses may still
// arrive but must never reach the UI (guarded by turnId / submitInFlight).
// Deliberately does NOT abort state.interview.turnController: the answer
// submission itself must be allowed to finish.
function stopVoiceIo() {
  state.interview.asrController?.abort();
  state.interview.asrController = null;
  state.audio?.setSending(false);
  stopRecognition();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  state.ttsController?.abort();
  state.ttsController = null;
  if (state.ttsAudio) {
    state.ttsAudio.onended = null;
    state.ttsAudio.onerror = null;
    try { state.ttsAudio.pause(); } catch (_) { /* Already stopped. */ }
    state.ttsAudio = null;
  }
}

function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return false;
  const recognition = new SpeechRecognition();
  recognition.lang = "zh-CN";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onresult = (event) => {
    let combined = "";
    for (let i = 0; i < event.results.length; i += 1) {
      combined += event.results[i][0].transcript;
    }
    if (combined.trim()) {
      state.interview.transcript = combined.trim();
      $("liveTranscript").textContent = state.interview.transcript;
      setAnswerDraft(appendTranscript(state.interview.voiceBase, state.interview.transcript), "voice-interim");
    }
  };
  recognition.onerror = (event) => {
    if (["no-speech", "aborted"].includes(event.error)) return;
    state.interview.noSpeechCount += 1;
    if (state.interview.noSpeechCount >= 2) enableTextFallback("连续两次没有听清，请直接输入这一题。");
  };
  recognition.onend = () => {
    if (state.interview.active && !state.interview.paused && state.interview.mode === "local-speech") startRecognition();
  };
  state.recognition = recognition;
  return true;
}

function enableTextFallback(message) {
  state.interview.mode = !state.localMode && state.caseId && state.caseToken
    ? "server-text"
    : "local-text";
  stopRecognition();
  state.audio?.setSending(false);
  $("textFallback").hidden = false;
  $("transcriptMode").textContent = message;
  setListening("paused", "等待文字回答");
  $("fallbackAnswer").focus();
}

function activateLocalFallback(message) {
  state.localMode = true;
  const hasSpeech = setupSpeechRecognition();
  state.interview.mode = hasSpeech ? "local-speech" : "local-text";
  $("transcriptMode").textContent = hasSpeech
    ? "正在使用设备自带语音识别；答案仍会自动跳题"
    : "当前浏览器没有可用语音识别，请使用文字降级";
  $("interviewNotice").textContent = message;
  $("textFallback").hidden = false;
  state.interview.questionIndex = 0;
  askQuestion(questionAt(0), 0);
}

async function beginInterview() {
  if (!state.stage || !state.locationConfirmed) return;
  setProductView("workspace");
  if (DEMO_MODE) {
    void startDemoInterview();
    return;
  }
  if (isSiteReportMode()) {
    void startSiteReport();
    return;
  }
  setPanel("interview");
  state.interview.active = true;
  state.interview.paused = false;
  state.interview.complete = false;
  state.interview.questionIndex = -1;
  $("textFallback").hidden = false;
  setListening("", "正在申请麦克风");

  state.audio = new ContinuousAudio(transcribeRecordedAnswer);
  let microphoneReady = false;
  try {
    await state.audio.start();
    microphoneReady = true;
  } catch (_) {
    state.audio = null;
    enableTextFallback("没有取得麦克风权限，已切换到文字问诊。");
  }

  await createCase();
  if (!microphoneReady) {
    const first = state.firstQuestion || questionAt(0);
    state.interview.mode = state.localMode ? "local-text" : "server-text";
    state.interview.questionIndex = 0;
    askQuestion({
      id: first.factId || first.id || first.field,
      text: first.text,
      kind: first.kind || questionAt(0)?.kind || "text",
      label: first.label || FACT_LABELS[first.field] || questionAt(0)?.label
    }, 0);
    return;
  }
  if (state.localMode || !state.caseToken) {
    state.audio?.stop();
    state.audio = null;
    activateLocalFallback("云端案卷没有建立成功，已切换到本机问诊。");
    return;
  }

  state.interview.mode = "dashscope-http";
  $("transcriptMode").textContent = "阿里云 Fun-ASR-Flash 已连接；停顿后显示整段识别结果";
  const first = state.firstQuestion || questionAt(0);
  askQuestion({
    id: first.factId || first.id || first.field,
    text: first.text,
    kind: first.kind || questionAt(0)?.kind || "text",
    label: first.label || FACT_LABELS[first.field] || questionAt(0)?.label
  }, 0);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function typeDemoText(element, text, token, delay = 18) {
  const isField = element.tagName === "TEXTAREA" || element.tagName === "INPUT";
  if (isField) element.value = ""; else element.textContent = "";
  for (let index = 0; index < text.length; index += 1) {
    if (token !== state.demoPlaybackToken) return false;
    if (isField) element.value += text[index]; else element.textContent += text[index];
    await wait(delay);
  }
  return true;
}

function setDemoQuestion(question, index) {
  state.interview.questionIndex = index;
  state.interview.turnId = `demo-turn-${index + 1}`;
  $("currentQuestion").dataset.factId = question.id;
  $("currentQuestion").dataset.factKind = question.kind || "text";
  $("currentQuestion").dataset.factLabel = question.label || FACT_LABELS[question.id] || "事实";
  $("questionProgress").textContent = `${index + 1}/12`;
  $("questionHint").textContent = "正在按运城小碗菜的真实案例逐题填入。";
}

async function startDemoInterview() {
  const token = ++state.demoPlaybackToken;
  state.localMode = true;
  state.caseId = `demo-${Date.now()}`;
  state.caseToken = null;
  state.interview.active = true;
  state.interview.paused = false;
  state.interview.complete = false;
  state.interview.mode = "demo";
  state.interview.questionIndex = -1;
  upsertFact({ id: "stage", label: "经营阶段", kind: "text", value: state.stage, status: "confirmed", source: "choice", evidence: "B" });
  upsertFact({ id: "category", label: "经营品类", kind: "text", value: $("category").value.trim(), status: "confirmed", source: "document", evidence: "B" });
  $("previousQuestion").hidden = true;
  $("confirmAnswer").disabled = true;
  $("transcriptMode").textContent = "正在自动填入运城小碗菜的真实字幕数据；不影响后续分析";
  setPanel("interview");
  const VISIBLE_TURNS = 8;
  for (let index = 0; index < DEMO_CASE.turns.length; index += 1) {
    if (token !== state.demoPlaybackToken) return;
    const [factId, answer] = DEMO_CASE.turns[index];
    const question = questionList().find(([id]) => id === factId);
    if (!question) continue;
    if (index >= VISIBLE_TURNS) {
      // Only the first few turns are played back visually; the rest are filled
      // in silently so the review list stays complete without a long wait.
      const fact = upsertFact(extractLocalFact(answer, {
        id: question[0],
        kind: question[2],
        label: question[3]
      }));
      state.transcripts.push({ turnId: `demo-turn-${index + 1}`, question: question[1], text: answer, factId: fact.id, source: "demo-subtitle" });
      continue;
    }
    const startedAt = Date.now();
    const prepared = { id: question[0], text: question[1], kind: question[2], label: question[3] };
    setDemoQuestion(prepared, index);
    $("fallbackAnswer").value = "";
    setListening("", "正在展示案例问题");
    const questionComplete = await typeDemoText($("currentQuestion"), prepared.text, token, DEMO_CHAR_MS);
    if (!questionComplete) return;
    await wait(Math.min(500, DEMO_TURN_MS * .16));
    setListening("live", "正在展示案例回答");
    const answerComplete = await typeDemoText($("fallbackAnswer"), answer, token, DEMO_CHAR_MS);
    if (!answerComplete) return;
    const fact = upsertFact(extractLocalFact(answer, prepared));
    state.transcripts.push({ turnId: state.interview.turnId, question: prepared.text, text: answer, factId: fact.id, source: "demo-subtitle" });
    const remaining = DEMO_TURN_MS - (Date.now() - startedAt);
    if (remaining > 0) await wait(remaining);
  }
  if (token !== state.demoPlaybackToken) return;
  state.interview.active = false;
  state.interview.complete = true;
  prepareReview();
  $("submitReview").textContent = "下一步：查看判断";
  $("reviewFormStatus").textContent = "已用运城小碗菜的真实数据填好这份档案，不影响后续分析；直接点下一步继续。";
}

function parseMagnitude(numberText, unit) {
  const value = Number(numberText);
  if (!Number.isFinite(value)) return null;
  if (unit === "万") return value * 10000;
  if (unit === "千") return value * 1000;
  if (unit === "百") return value * 100;
  return value;
}

function chineseInteger(token) {
  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const units = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
  let section = 0;
  let total = 0;
  let current = 0;
  let wanSeen = false;
  for (const character of token) {
    if (character in digits) {
      current = digits[character];
      continue;
    }
    const unit = units[character];
    if (!unit) continue;
    if (unit === 10000) {
      wanSeen = true;
      section += current;
      total += Math.max(1, section) * unit;
      section = 0;
      current = 0;
    } else {
      section += Math.max(1, current) * unit;
      current = 0;
    }
  }
  // “两万七”“一万八”这类口语简写：万后面的尾数表示千。
  if (wanSeen && section === 0 && current > 0 && current < 10 && !token.includes("零") && !token.includes("〇")) return total + current * 1000;
  return total + section + current;
}

function normalizeChineseNumbers(text) {
  const protectedArabicUnits = [];
  const protectedText = text
    // “百分之” describes the denominator; it is not another numeric value.
    // Removing the prefix keeps “百分之四十五” as 45 instead of candidates
    // [100, 45], which would otherwise make the parser choose 100.
    .replace(/百分之(?=[零〇一二两三四五六七八九十百千万\d])/g, "")
    .replace(/\d+(?:\.\d+)?[万千百]/g, (token) => {
      const index = protectedArabicUnits.push(token) - 1;
      return `__ARABIC_UNIT_${index}__`;
    })
    // “一天”“一个月”“三年”这类时间量不是金额，保留原文避免被当成数字。
    .replace(/[零〇一二两三四五六七八九十百千万]+(?=[天日月年季周])/g, (token) => {
      const index = protectedArabicUnits.push(token) - 1;
      return `__ARABIC_UNIT_${index}__`;
    });
  return protectedText
    .replace(/[零〇一二两三四五六七八九十百千万]+/g, (token) => String(chineseInteger(token)))
    .replace(/__ARABIC_UNIT_(\d+)__/g, (_, index) => protectedArabicUnits[Number(index)]);
}

function parseNumericAnswer(text, kind) {
  const normalized = normalizeChineseNumbers(text).replace(/[,，]/g, "");
  const range = normalized.match(/(\d+(?:\.\d+)?)\s*(万|千|百)?\s*(?:到|至|[-—~])\s*(\d+(?:\.\d+)?)\s*(万|千|百)?/);
  if (range) {
    let low = parseMagnitude(range[1], range[2] || range[4]);
    let high = parseMagnitude(range[3], range[4] || range[2]);
    // “十到十二万”会先被转换成“10到120000”；补齐省略的量级。
    if (low < 1000 && high >= 1000) low *= high >= 10000 ? 10000 : 1000;
    if (high < 1000 && low >= 1000) high *= low >= 10000 ? 10000 : 1000;
    return { range: { min: Math.min(low, high), max: Math.max(low, high) }, value: null };
  }
  // 一句话里可能有多个数字（“一天四千，一个月十二万”），取量级最大的作为答案。
  const candidates = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(万|千|百)?/g)]
    .map((item) => parseMagnitude(item[1], item[2]));
  if (!candidates.length) return { value: null, range: null };
  let value = Math.max(...candidates);
  if (kind === "rate" && /毛利/.test(normalized) && !/成本/.test(normalized)) value = 100 - value;
  return { value, range: null };
}

function extractLocalFact(text, question = null) {
  // Normal manual answers use the live DOM question. Demo playback also fills
  // silent turns, so it must pass its own immutable question instead of
  // accidentally assigning every later answer to the last visible field.
  const id = question?.id || $("currentQuestion").dataset.factId;
  const kind = question?.kind || $("currentQuestion").dataset.factKind || "text";
  const label = question?.label || $("currentQuestion").dataset.factLabel || FACT_LABELS[id] || "事实";
  const unknown = /(不知道|不清楚|没算过|说不准|不确定)/.test(text);
  if (unknown) {
    return { id, label, kind, value: null, range: null, status: "unknown", source: "voice", evidence: "U", raw: text };
  }
  if (["money", "rate", "count"].includes(kind)) {
    if (id === "debt" && /(没有|没欠|零负债|无负债)/.test(text)) {
      return { id, label, kind, value: 0, range: null, status: "provisional", source: "voice", evidence: "C", raw: text };
    }
    const parsed = parseNumericAnswer(text, kind);
    if (parsed.value === null && !parsed.range) {
      return { id, label, kind, value: text, status: "provisional", source: "voice", evidence: "D", raw: text };
    }
    return {
      id,
      label,
      kind,
      ...parsed,
      period: /(一年|每年|年租|一年期)/.test(text) ? "year" : "month",
      status: "provisional",
      source: "voice",
      evidence: "C",
      raw: text
    };
  }
  let value = text;
  if (kind === "choice") {
    if (/(不是|不能|不会|没有|没做)/.test(text)) value = "no";
    else if (/(是|能|会|有|做过)/.test(text)) value = "yes";
    else value = "unknown";
  }
  return { id, label, kind, value, status: value === "unknown" ? "unknown" : "provisional", source: "voice", evidence: "C", raw: text };
}

function appendTranscript(existing, addition) {
  const head = String(existing || "").trim();
  const tail = String(addition || "").trim();
  if (!head) return tail;
  if (!tail) return head;
  return /[，。！？；、,.!?;:\s]$/.test(head) ? head + tail : `${head}，${tail}`;
}

function setAnswerDraft(text, source = "typed") {
  const value = String(text || "").trim();
  state.interview.draft = value;
  state.interview.draftSource = source;
  $("fallbackAnswer").value = value;
}

async function confirmAnswerDraft() {
  const text = $("fallbackAnswer").value.trim();
  if (!text || state.interview.submitInFlight || state.interview.busy) return;
  stopVoiceIo();
  setInterviewBusy(true);
  const snapshot = {
    turnId: state.interview.turnId,
    questionId: $("currentQuestion").dataset.factId,
    question: $("currentQuestion").textContent,
    caseVersion: state.caseVersion,
    source: state.interview.draftSource || "typed"
  };
  state.interview.draft = text;
  $("liveTranscript").textContent = text;
  state.transcripts.push({ turnId: snapshot.turnId, text, question: snapshot.question });
  if (state.localMode || !state.caseId) {
    const fact = upsertFact(extractLocalFact(text));
    state.interview.progress.asked += 1;
    const nextIndex = state.interview.questionIndex + 1;
    if (nextIndex >= Math.min(questionList().length, 12)) return completeInterview();
    return askQuestion(questionAt(nextIndex), nextIndex);
  }
  await submitRemoteTurn(text, snapshot);
}

function completeInterview() {
  state.interview.active = false;
  state.interview.complete = true;
  state.interview.finishRequested = false;
  state.interview.pendingQuestion = null;
  setInterviewBusy(false);
  state.audio?.setSending(false);
  stopRecognition();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  prepareReview();
}

function finishInterview() {
  state.interview.asrController?.abort();
  state.interview.asrController = null;
  state.audio?.setSending(false);
  stopRecognition();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  if (state.interview.submitInFlight) {
    state.interview.finishRequested = true;
    setListening("paused", "正在保存最后一句，马上进入查证");
    return;
  }
  completeInterview();
}

function reviewableFacts() {
  const excluded = new Set(["stage", "location"]);
  return state.facts.filter((fact) => !excluded.has(fact.id));
}

function formatFact(fact) {
  if (fact.status === "unknown" || (fact.value == null && !fact.range)) return "不知道";
  if (fact.range) {
    return `${formatUnit(fact.range.min, fact.kind)}—${formatUnit(fact.range.max, fact.kind)}${fact.period === "year" ? " / 年" : ""}`;
  }
  if (fact.kind === "choice") return ({ yes: "是", no: "否", unknown: "不确定" })[fact.value] || fact.value;
  return `${formatUnit(fact.value, fact.kind)}${fact.period === "year" ? " / 年" : ""}`;
}

function formatUnit(value, kind) {
  if (typeof value !== "number") return String(value);
  if (kind === "money") return `¥${money.format(value)}`;
  if (kind === "rate") return `${value}%`;
  if (kind === "count") return `${money.format(value)} 个`;
  return money.format(value);
}

function prepareReview() {
  state.audio?.stop();
  state.audio = null;
  const existing = new Set(state.facts.map((fact) => fact.id));
  questionList().forEach(([id, , kind, label]) => {
    if (existing.has(id)) return;
    upsertFact({
      id,
      label,
      kind,
      value: null,
      range: null,
      status: "unknown",
      source: "calculation",
      evidence: "U",
      raw: ""
    });
  });
  state.reviewSubmitted = false;
  $("reviewForm").hidden = false;
  $("reviewSummary").hidden = true;
  setPanel("review");
  renderReviewForm();
}

function reviewDraftText(fact) {
  const raw = fact.rawTranscript ?? fact.raw ?? fact.transcript;
  if (String(raw || "").trim()) return String(raw).trim();
  return fact.status === "unknown" ? "" : formatFact(fact);
}

function setReviewRowMode(row, mode) {
  row.dataset.mode = mode;
  row.querySelectorAll('input[type="radio"]').forEach((radio) => {
    radio.checked = radio.value === mode;
  });
}

function renderReviewForm() {
  const facts = reviewableFacts();
  $("reviewFactsList").innerHTML = facts.map((fact, index) => {
    const mode = fact.status === "unknown" ? "unknown" : "correct";
    const source = fact.source === "voice" ? "语音识别" : fact.source === "typed" ? "手动输入" : "系统整理";
    return `
      <fieldset class="fact-review-row" data-fact-index="${index}" data-mode="${mode}" data-testid="fact-review-row">
        <div class="fact-review-heading">
          <span>${escapeHtml(fact.label || FACT_LABELS[fact.id] || fact.id)}<small>${escapeHtml(source)} · 证据 ${escapeHtml(fact.evidence || "U")}</small></span>
          <strong>${escapeHtml(formatFact(fact))}</strong>
        </div>
        <div class="fact-review-modes">
          <label class="fact-review-choice">
            <input type="radio" name="review-${index}" value="correct" ${mode === "correct" ? "checked" : ""}>
            <span>AI 记录正确</span>
          </label>
          <label class="fact-review-choice unknown">
            <input type="radio" name="review-${index}" value="unknown" ${mode === "unknown" ? "checked" : ""}>
            <span>我不知道</span>
          </label>
          <label class="fact-review-edit">
            <input type="radio" name="review-${index}" value="edit">
            <span class="fact-review-edit-body">
              <small>修改我说的话</small>
              <textarea rows="1" data-role="edit-text" aria-label="修改${escapeHtml(fact.label || fact.id)}" placeholder="点这里直接改">${escapeHtml(reviewDraftText(fact))}</textarea>
            </span>
          </label>
        </div>
        <p class="fact-review-error" data-role="error" aria-live="polite"></p>
      </fieldset>
    `;
  }).join("");

  $("reviewFactsList").querySelectorAll(".fact-review-row").forEach((row) => {
    if (DEMO_MODE) {
      row.addEventListener("click", (event) => {
        event.preventDefault();
        row.classList.remove("demo-tapped");
        requestAnimationFrame(() => row.classList.add("demo-tapped"));
      }, true);
      row.querySelector("[data-role=edit-text]").readOnly = true;
      return;
    }
    row.querySelectorAll('input[type="radio"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        row.dataset.mode = radio.value;
        row.classList.remove("invalid");
        row.querySelector('[data-role="error"]').textContent = "";
      });
    });
    const editor = row.querySelector('[data-role="edit-text"]');
    ["focus", "input"].forEach((eventName) => editor.addEventListener(eventName, () => {
      setReviewRowMode(row, "edit");
      row.classList.remove("invalid");
      row.querySelector('[data-role="error"]').textContent = "";
    }));
  });
}

function parseEditedFact(fact, rawText) {
  const text = String(rawText || "").trim();
  if (!text) throw new Error("修改内容不能为空；如果确实不知道，请选择“我不知道”");
  const next = {
    ...fact,
    status: "confirmed",
    source: "typed",
    evidence: "B",
    evidenceGrade: "B",
    raw: text,
    rawTranscript: text,
    transcript: text,
    updatedAt: new Date().toISOString()
  };
  if (["money", "rate", "count"].includes(fact.kind)) {
    if (fact.id === "debt" && /(没有|没欠|零负债|无负债)/.test(text)) {
      next.value = 0;
      next.range = null;
    } else {
      const parsed = parseNumericAnswer(text, fact.kind);
      if (parsed.value === null && !parsed.range) throw new Error("没有读到数字，请写金额、比例、人数或一个范围");
      next.value = parsed.value;
      next.range = parsed.range;
    }
    if (/(一年|每年|年租|一年期|\/年)/.test(text)) next.period = "year";
    else if (/(一个月|每月|月租|\/月)/.test(text)) next.period = "month";
    else next.period = fact.period || "month";
    return next;
  }
  if (fact.kind === "choice") {
    if (/(不知道|不确定|说不准)/.test(text)) {
      next.value = null;
      next.range = null;
      next.status = "unknown";
      next.evidence = "U";
      next.evidenceGrade = "U";
    } else if (/(不是|不能|不会|没有|没做|否)/.test(text)) {
      next.value = "no";
      next.range = null;
    } else if (/(是|能|会|有|做过|可以)/.test(text)) {
      next.value = "yes";
      next.range = null;
    } else {
      throw new Error("请写“是”“否”，或者选择“我不知道”");
    }
    return next;
  }
  next.value = text;
  next.range = null;
  return next;
}

function collectReviewCorrections() {
  const facts = reviewableFacts();
  const corrections = [];
  let firstInvalid = null;
  $("reviewFactsList").querySelectorAll(".fact-review-row").forEach((row) => {
    const fact = facts[Number(row.dataset.factIndex)];
    const mode = row.querySelector('input[type="radio"]:checked')?.value || "correct";
    let next;
    try {
      if (mode === "unknown") {
        next = {
          ...fact, value: null, range: null, status: "unknown", source: "choice",
          evidence: "U", evidenceGrade: "U", updatedAt: new Date().toISOString()
        };
      } else if (mode === "edit") {
        next = parseEditedFact(fact, row.querySelector('[data-role="edit-text"]').value);
      } else {
        next = {
          ...fact,
          status: fact.value == null && !fact.range ? "unknown" : "confirmed",
          source: "choice",
          evidence: fact.value == null && !fact.range ? "U" : "B",
          evidenceGrade: fact.value == null && !fact.range ? "U" : "B",
          updatedAt: new Date().toISOString()
        };
      }
      row.classList.remove("invalid");
      row.querySelector('[data-role="error"]').textContent = "";
      corrections.push(next);
    } catch (error) {
      row.classList.add("invalid");
      row.querySelector('[data-role="error"]').textContent = error.message;
      firstInvalid ||= row;
    }
  });
  if (firstInvalid) {
    firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
    return null;
  }
  return corrections;
}

async function submitReviewForm() {
  if (DEMO_MODE) {
    state.reviewSubmitted = true;
    startDemoAnalysis();
    return;
  }
  let corrections = collectReviewCorrections();
  if (!corrections) {
    $("reviewFormStatus").textContent = "有一项修改无法解析，请按红色提示处理。";
    return;
  }
  const button = $("submitReview");
  button.disabled = true;
  button.textContent = "正在提交…";
  $("reviewFormStatus").textContent = "正在保存整份事实档案…";
  try {
    const correctionIds = new Set(corrections.map((fact) => fact.id));
    let nextFacts = state.facts.map((fact) => correctionIds.has(fact.id)
      ? corrections.find((item) => item.id === fact.id)
      : fact);
    if (!state.localMode && state.caseId) {
      const reviewed = await fetchJson(`/api/cases/${encodeURIComponent(state.caseId)}/review`, {
        method: "POST",
        headers: caseHeaders({ "Content-Type": "application/json", "Accept": "application/json" }),
        body: JSON.stringify({ caseVersion: state.caseVersion, corrections })
      }, 10_000);
      if (Array.isArray(reviewed.facts)) {
        const serverFacts = new Map(reviewed.facts.map((fact) => [fact.id, fact]));
        nextFacts = nextFacts.map((fact) => serverFacts.has(fact.id)
          ? { ...fact, ...serverFacts.get(fact.id), label: fact.label, kind: fact.kind }
          : fact);
      }
      if (Number.isFinite(Number(reviewed.version))) state.caseVersion = Number(reviewed.version);
    } else {
      state.caseVersion += 1;
    }
    state.facts = nextFacts;
    state.reviewSubmitted = true;
    $("reviewForm").hidden = true;
    renderReviewSummary();
  } catch (error) {
    $("reviewFormStatus").textContent = `提交失败：${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = "确定提交";
  }
}

function renderReviewSummary() {
  $("reviewSummary").hidden = false;
  const facts = reviewableFacts();
  const known = facts.filter((fact) => fact.status !== "unknown");
  $("reviewSummaryList").innerHTML = known.slice(0, 8).map((fact) => `
    <div><span>${escapeHtml(fact.label)}</span><b>${escapeHtml(formatFact(fact))}</b></div>
  `).join("") + (known.length > 8 ? `<div><span>其他已确认事实</span><b>${known.length - 8} 项</b></div>` : "");
}

function conservativeValue(fact, costField = false) {
  if (!fact || fact.status === "unknown") return null;
  if (Number.isFinite(Number(fact.value))) {
    const value = Number(fact.value);
    return fact.period === "year" ? value / 12 : value;
  }
  if (fact.range) {
    const low = fact.range.min;
    const high = fact.range.max;
    const selected = costField ? (Number.isFinite(high) ? high : low) : (Number.isFinite(low) ? low : high);
    return fact.period === "year" ? selected / 12 : selected;
  }
  return null;
}

function factById(id) {
  return state.facts.find((fact) => fact.id === id);
}

function toEngineInput() {
  const ids = ["monthlyRevenue", "variableCostRate", "rent", "labor", "ownerReplacementWage", "otherFixed", "cashReserve", "avgTicket", "plannedCommitment", "debt"];
  const costs = new Set(["variableCostRate", "rent", "labor", "ownerReplacementWage", "otherFixed", "debt", "plannedCommitment"]);
  const values = {};
  const known = {};
  ids.forEach((id) => {
    const value = conservativeValue(factById(id), costs.has(id));
    values[id] = value ?? 0;
    known[id] = value !== null;
  });
  const choice = (id) => {
    const fact = factById(id);
    return fact?.status === "unknown" ? "unknown" : (fact?.value || "unknown");
  };
  return {
    ...values,
    known,
    stage: state.stage === "preopen" ? "preopen" : "operating",
    category: factById("category")?.value || "餐饮",
    locationConfirmed: state.locationConfirmed,
    mapContextLoaded: state.mapContextLoaded,
    trafficMatch: choice("trafficMatch"),
    visibility: choice("visibility"),
    retention: choice("retention")
  };
}

function deterministicAssessment() {
  const input = toEngineInput();
  const required = input.stage === "operating"
    ? ["monthlyRevenue", "variableCostRate", "rent", "labor", "ownerReplacementWage", "otherFixed", "cashReserve", "avgTicket"]
    : ["variableCostRate", "rent", "labor", "ownerReplacementWage", "otherFixed", "cashReserve", "avgTicket", "plannedCommitment"];
  const missing = required.filter((id) => !input.known[id]);
  if (missing.length >= 3 || typeof DecisionEngine === "undefined") {
    return {
      decision: "EVIDENCE",
      title: "先补关键证据，不做大额决定",
      reason: `还有 ${missing.length} 项关键账目未知。现在给出精确利润会制造虚假确定性。`,
      metrics: { completeness: Math.round(((required.length - missing.length) / required.length) * 100) },
      nextAction: "先补齐收银、租金、人工和现金数据",
      stopLine: "关键数字未确认前，不签新合同、不加盟、不追加装修"
    };
  }
  try {
    if (typeof FactStore !== "undefined") {
      return DecisionEngine.assess({
        facts: state.facts.map((fact) => ({
          ...fact,
          field: fact.field || fact.id,
          evidenceGrade: fact.evidenceGrade || fact.evidence,
          rawTranscript: fact.rawTranscript ?? fact.raw
        })),
        stage: input.stage,
        category: input.category,
        locationConfirmed: input.locationConfirmed,
        mapContextLoaded: input.mapContextLoaded,
        trafficMatch: input.trafficMatch,
        visibility: input.visibility,
        retention: input.retention
      });
    }
    return DecisionEngine.assess(input);
  } catch (_) {
    return {
      decision: "EVIDENCE",
      title: "先补关键证据",
      reason: "本地计算无法形成可靠结论，但已经保留你的事实档案。",
      metrics: { completeness: 0 },
      nextAction: "核对关键账目",
      stopLine: "数据核对前不做不可逆投入"
    };
  }
}

// Preopen path: create the case, then ask the server for a one-shot map report
// (recommend categories when "我不知道", feasibility for a chosen category).
async function startSiteReport() {
  setProductView("result");
  setPanel("result");
  $("analysisProgress").hidden = false;
  $("analysisFailure").hidden = true;
  $("result").hidden = true;
  state.analysisFloor = 0;
  $("analysisTitle").textContent = "正在读取周边环境";
  $("analysisStatus").textContent = "在扫描竞品、客群与交通信号，按勇哥框架判断能不能开…";
  setAnalysisProgress(15);
  document.querySelectorAll("#analysisSteps li").forEach((item, index) => item.classList.toggle("active", index === 0));
  try {
    await createCase();
    const category = $("category").value.trim() || "我不知道";
    setAnalysisProgress(45);
    if (!state.localMode && state.caseId) {
      const data = await fetchJson(`/api/cases/${encodeURIComponent(state.caseId)}/analyze`, {
        method: "POST",
        headers: caseHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ mode: "site-map", category })
      }, 40000);
      if (data.status === "complete" || data.result) {
        stopProgressAnimation();
        renderAnalysisResult(data.result || data);
        return;
      }
      if (data.runId) {
        watchAnalysisRun(data.runId);
        return;
      }
    }
    throw new Error("云端未连接，无法生成地图报告，请检查网络后重试。");
  } catch (error) {
    showAnalysisFailure(error);
  }
}

async function startAnalysis() {
  if (!state.reviewSubmitted) {
    setPanel("review");
    $("reviewFormStatus").textContent = "请先在本页底部点击“确定提交”。";
    return;
  }
  setProductView("result");
  setPanel("result");
  $("analysisProgress").hidden = false;
  $("result").hidden = true;
  state.analysisFloor = 0;
  $("analysisTitle").textContent = "先按勇哥框架算账";
  $("analysisStatus").textContent = "正在检查单位经济、现金寿命和第一断点…";
  setAnalysisProgress(8);
  document.querySelectorAll("#analysisSteps li").forEach((item, index) => item.classList.toggle("active", index === 0));
  const deterministicResult = deterministicAssessment();
  const payload = {
    caseVersion: state.caseVersion,
    facts: state.facts,
    transcripts: state.transcripts,
    deterministicResult,
    search: { targetCandidates: 3, maxAttempts: 3, concurrency: 3, verifiers: ["evidence_causality", "finance_execution"] }
  };
  if (!state.localMode && state.caseId) {
    try {
      const data = await fetchJson(`/api/cases/${encodeURIComponent(state.caseId)}/analyze`, {
        method: "POST",
        headers: caseHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload)
      }, 15000);
      if (data.status === "complete" || data.result || data.topPlans) {
        stopProgressAnimation();
        renderAnalysisResult(data.result || data);
        return;
      }
      if (data.runId) {
        watchAnalysisRun(data.runId);
        return;
      }
    } catch (_) {
      state.localMode = true;
    }
  }
  // Local fallback: keep only a short anti-flash delay, no fake progress theater.
  setTimeout(() => {
    stopProgressAnimation();
    renderAnalysisResult(localAnalysis());
  }, 800);
}

function demoAnalysisResult() {
  return {
    deterministic: {
      decision: "TEST",
      title: "先把座位与外卖做成可测的小实验",
      reason: "你的日营业额、毛利、房租、人工和水电已能说明门店有经营余量；但订单、客单、复购和老板劳动仍未知，不能把“生意不错”直接当成可以盲目扩张。",
      metrics: {
        completeness: 63,
        breakEvenDaily: 2_350,
        breakEvenOrders: 59,
        monthlyProfit: 22_750,
        runway: Infinity
      }
    },
    narrative: {
      title: "先看高峰承接，不先扩店",
      body: "你这家山西运城稷山县的私房小碗菜店：日收约 4000、毛利约 45%、年租 2.7 万、人工约 1.9 万、水电气约 1 万，同时反映座位不够、外卖只能随机搭配。先用低成本实验验证座位周转和固定套餐，而不是立刻追加装修或人员。"
    },
    candidateCount: 3,
    verified: 3,
    topPlans: [
      {
        id: "demo-seat-flow", title: "连续三天记录高峰座位与放弃入店", score: 93,
        bottleneck: "座位与动线承接", action: "午、晚高峰各记录 90 分钟：到店、等位、离开、入座时间。只移动非关键物料和排队提示，不先装修。",
        budgetCap: 300, durationDays: 3, metric: "高峰放弃入店数与翻台时间",
        successLine: "放弃入店下降 20%，且平均等位不变长", stopLine: "三天没有拥堵证据，就停止为座位追加预算"
      },
      {
        id: "demo-takeaway-set", title: "用固定可供套餐替代随机外卖", score: 89,
        bottleneck: "外卖菜单不可理解", action: "只挑每日稳定供应的 3 组套餐上架；缺货就下架，不用随机菜名承诺固定菜品。",
        budgetCap: 200, durationDays: 3, metric: "外卖有效订单与退款率",
        successLine: "三天内固定套餐带来稳定订单且退款不升", stopLine: "若出餐混乱或退款上升，立即撤回套餐"
      },
      {
        id: "demo-energy-ledger", title: "把水电气拆成每日账，再决定设备动作", score: 84,
        bottleneck: "高能耗成本未拆账", action: "连续七天分开记录电、气、保温台和主要设备开启时段，先找异常项，不直接更换设备。",
        budgetCap: 0, durationDays: 7, metric: "每百元营业额水电气成本",
        successLine: "找出可关闭、错峰或替代的一项明确成本", stopLine: "数据无异常时，不为节能设备新增投入"
      }
    ],
    rejectedReasons: [
      "没有订单、客单和复购数据，不建议直接开第二家店",
      "没有现场转化计数，不把附近业态或主观人流当作扩店证据",
      "老板与家人劳动未计价，不把账面利润直接当作可自由支配利润"
    ]
  };
}

function startDemoAnalysis() {
  setProductView("result");
  setPanel("result");
  $("analysisProgress").hidden = false;
  $("result").hidden = true;
  $("analysisTitle").textContent = "正在复核账目";
  $("analysisStatus").textContent = "正在检查单位经济、现金寿命和第一断点…";
  state.analysisFloor = 0;
  setAnalysisProgress(16);
  const markDemoStep = (n) => document.querySelectorAll("#analysisSteps li").forEach((item, index) => item.classList.toggle("active", index <= n));
  markDemoStep(0);
  setTimeout(() => {
    $("analysisTitle").textContent = "正在生成候选方案";
    $("analysisStatus").textContent = "多条独立流水线同时生成位置、产品、人员、渠道等候选…";
    setAnalysisProgress(42);
    markDemoStep(1);
  }, 2000);
  setTimeout(() => {
    $("analysisTitle").textContent = "正在做证据与因果核验";
    $("analysisStatus").textContent = "核对证据引用、替代解释、预算和停止线…";
    setAnalysisProgress(66);
    markDemoStep(2);
  }, 4200);
  setTimeout(() => {
    $("analysisTitle").textContent = "正在做财务与执行核验";
    $("analysisStatus").textContent = "算不过账、不可逆或无法测量的方案直接淘汰…";
    setAnalysisProgress(88);
    markDemoStep(3);
  }, 5800);
  setTimeout(() => {
    $("analysisTitle").textContent = "正在合并重复机制";
    $("analysisStatus").textContent = "优先保留低预算、可停止、可测量的实验。";
    setAnalysisProgress(96);
    markDemoStep(4);
  }, 6600);
  setTimeout(() => renderAnalysisResult(demoAnalysisResult()), 7200);
}

// Real server phases drive the progress bar. No timed theater: the bar only
// moves when the server reports a new phase or more audited candidates, and
// it never moves backward within one analysis run.
const ANALYSIS_PHASES = {
  "queued": { percent: 8, step: 0 },
  "round-start": { percent: 12, step: 0, title: "先按勇哥框架算账" },
  "generate": { percent: 33, step: 1, title: "正在探索不同经营杠杆" },
  "verify-evidence": { percent: 50, step: 2, title: "正在淘汰讲不通的方案" },
  "verify-execution": { percent: 66, step: 3, title: "正在做财务与执行核验" },
  "round-complete": { percent: 85, step: 4, title: "正在合并重复机制" },
  "completed": { percent: 100, step: 4 }
};

function renderRunProgress(progress) {
  const phase = ANALYSIS_PHASES[progress?.phase];
  const completed = Number(progress?.completed) || 0;
  const target = Number(progress?.target) || 3;
  const ratio = Math.max(0, Math.min(1, completed / target));
  setAnalysisProgress(Math.max(phase?.percent ?? 8, 8 + ratio * 87));
  if (phase?.title) $("analysisTitle").textContent = phase.title;
  if (Number.isInteger(phase?.step)) {
    document.querySelectorAll("#analysisSteps li").forEach((item, index) => item.classList.toggle("active", index <= phase.step));
  }
}

function setAnalysisProgress(percent) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  state.analysisFloor = Math.max(Number(state.analysisFloor) || 0, value);
  $("analysisProgressBar").style.width = `${state.analysisFloor}%`;
  $("analysisPercent").textContent = `${state.analysisFloor}%`;
}

function stopProgressAnimation() {
  clearInterval(state.analysisTimer);
  state.analysisTimer = null;
  setAnalysisProgress(100);
}

// A rejected request is not a completed report.  Keep failure and completion
// as separate UI states: never paint 100% while leaving the result empty.
function showAnalysisFailure(error) {
  clearInterval(state.analysisTimer);
  state.analysisTimer = null;
  $("analysisProgress").hidden = true;
  $("result").hidden = true;
  $("analysisFailure").hidden = false;
  $("analysisFailureTitle").textContent = "暂时无法生成报告";
  $("analysisFailureMessage").textContent = error?.message || "请检查网络后返回重新提交。";
}

function returnToLocationFromFailure() {
  $("analysisFailure").hidden = true;
  state.analysisFloor = 0;
  setProductView("workspace");
  setPanel("location");
}

async function watchAnalysisRun(runId) {
  const url = `/api/cases/${encodeURIComponent(state.caseId)}/runs/${encodeURIComponent(runId)}`;
  const deadline = Date.now() + 12 * 60 * 1000;
  while (Date.now() < deadline && !state.localMode) {
    try {
      const data = await fetchJson(url, {
        headers: caseHeaders({ "Accept": "application/json" })
      }, 10000);
      const progress = data.progress || {};
      renderRunProgress(progress);
      if (progress.phase) $("analysisStatus").textContent = progressLabel(progress);
      if (data.status === "completed" && data.result) {
        stopProgressAnimation();
        renderAnalysisResult(data.result);
        return;
      }
      if (["failed", "errored", "terminated"].includes(data.status)) {
        throw new Error(data.warning || "云端分析未完成");
      }
    } catch (_) {
      await new Promise((resolve) => setTimeout(resolve, 1800));
      continue;
    }
    await new Promise((resolve) => setTimeout(resolve, 1800));
  }
  stopProgressAnimation();
  renderAnalysisResult(localAnalysis());
}

function progressLabel(progress) {
  const labels = {
    queued: "已经排队，马上开始算账",
    generate: "正在并行生成 3 个不同机制",
    "verify-evidence": "正在逐条核验证据与因果",
    "verify-execution": "正在逐条核验财务与执行",
    "round-complete": `已完成 ${progress.completed || 0} / ${progress.target || 3} 条流水线`,
    completed: "方案搜索与双核验完成"
  };
  return labels[progress.phase] || "Agent 正在继续分析";
}

function localAnalysis() {
  const assessment = deterministicAssessment();
  const known = state.facts.filter((fact) => fact.status === "confirmed").length;
  const unknown = state.facts.filter((fact) => fact.status === "unknown").length;
  const locationWeak = factById("trafficMatch")?.value !== "yes" || factById("visibility")?.value !== "yes";
  const cash = conservativeValue(factById("cashReserve"));
  const plans = [];
  if (assessment.decision === "EVIDENCE") {
    plans.push({
      title: "用一天补齐四张经营底表",
      bottleneck: "关键账目证据不足",
      action: "导出收银流水、房租合同、工资表和账户余额，按月统一口径。",
      budgetCap: 0,
      durationDays: 1,
      metric: "关键字段确认率",
      successLine: "营业额、变动成本、固定成本、现金四项全部确认",
      stopLine: "数据仍矛盾时，不进入投钱方案",
      score: 92
    });
  }
  if (locationWeak) {
    plans.push({
      title: "做两次 20 分钟门口转化计数",
      bottleneck: "位置与门头转化尚未被证实",
      action: "午晚高峰分别记录经过、目标顾客、看见、进店和下单人数。",
      budgetCap: 0,
      durationDays: 2,
      metric: "目标客群→进店转化率",
      successLine: "至少完成两次同口径记录并找到第一断点",
      stopLine: "若目标客群本身极少，停止追加门头和投流预算",
      score: 89
    });
  }
  plans.push({
    title: "用最小预算验证第一断点",
    bottleneck: assessment.nextAction || "最先断裂的经营环节",
    action: assessment.nextAction || "只改变一个变量，连续三天记录结果。",
    budgetCap: Math.min(500, Number.isFinite(cash) ? Math.max(0, cash * .01) : 300),
    durationDays: 3,
    metric: "保本差额或关键转化率",
    successLine: "关键指标连续三天达到预设改善线",
    stopLine: assessment.stopLine || "没有改善就停止，不扩大预算",
    score: 86
  });
  plans.push({
    title: state.stage === "preopen" ? "先收钱试卖，再签长期合同" : "重新排一次人力与高峰产能",
    bottleneck: state.stage === "preopen" ? "需求尚未经过真实付费验证" : "人工与产能关系不清",
    action: state.stage === "preopen"
      ? "用临时摊位或预售完成真实交易，不用朋友圈口头意愿代替。"
      : "记录七天分时订单与工时，先调班次，不直接裁具体员工。",
    budgetCap: state.stage === "preopen" ? 1000 : 0,
    durationDays: 7,
    metric: state.stage === "preopen" ? "真实付费订单" : "每工时订单与高峰等待时间",
    successLine: state.stage === "preopen" ? "达到保本模型所需的最小订单密度" : "减少空闲工时且高峰服务不下降",
    stopLine: state.stage === "preopen" ? "试卖未过线就不签约装修" : "服务下降立即恢复原排班",
    score: 81
  });
  const unique = plans.filter((plan, index, all) => all.findIndex((item) => item.bottleneck === plan.bottleneck) === index).slice(0, 3);
  return {
    deterministic: assessment,
    narrative: {
      title: "当前结论",
      body: `${known} 项事实已经确认，${unknown} 项仍未知。系统优先保留可逆、便宜、能在短期证伪的动作。`
    },
    candidateCount: 3,
    validCandidateCount: unique.length,
    topPlans: unique,
    rejectedReasons: [
      "无法引用已确认事实，或把地图 POI 当成真实人流",
      "单位经济为负时仍建议先扩大投流",
      "没有预算、期限、成功线或停止线",
      "人员与产能证据不足，却直接建议裁掉具体员工"
    ],
    mode: "local-fallback"
  };
}

function normalizePlan(plan, index) {
  return {
    id: plan.id || `plan-${index + 1}`,
    title: plan.title || plan.action || `方案 ${index + 1}`,
    bottleneck: plan.bottleneck || plan.mechanism || "经营约束",
    action: plan.action || plan.description || "按计划执行并记录结果。",
    budgetCap: plan.budgetCap ?? plan.budget_cap ?? 0,
    durationDays: plan.durationDays ?? plan.duration_days ?? 3,
    metric: plan.metric || "关键经营指标",
    successLine: plan.successLine || plan.success_line || "达到预设改善线",
    stopLine: plan.stopLine || plan.stop_line || "没有改善就停止",
    score: plan.score ?? Math.max(70, 90 - index * 5),
    mechanism: plan.mechanism || "通过一项低成本、可撤回的动作验证关键经营假设。",
    rankReason: plan.rankReason || plan.rank_reason || "按客群匹配度、竞争强度和经营前提的相对成立程度排序。",
    competitionReason: plan.competitionReason || plan.competition_reason || "地图只能显示周边供给，必须现场核对实际价格、排队与空桌。",
    operatingRequirement: plan.operatingRequirement || plan.operating_requirement || "先把产品、出餐和门店动线做成可被验证的最小模型。",
    risk: plan.risk || "若现场客群或竞争与地图信号不一致，应停止追加投入。",
    hypothesis: plan.hypothesis || "该行动会改善当前首先断裂的经营环节。",
    evidenceRefs: Array.isArray(plan.evidenceRefs || plan.evidence_refs) ? (plan.evidenceRefs || plan.evidence_refs) : [],
    assumptions: Array.isArray(plan.assumptions) ? plan.assumptions : [],
    contraindications: Array.isArray(plan.contraindications) ? plan.contraindications : [],
    falsification: plan.falsification || "在验证周期内按预设指标观察，未达到成功线即停止。",
    detailMarkdown: typeof (plan.detailMarkdown || plan.detail_markdown) === "string"
      ? (plan.detailMarkdown || plan.detail_markdown).trim()
      : ""
  };
}

function planMarkdown(plan) {
  if (plan.detailMarkdown) return plan.detailMarkdown;
  const refs = plan.evidenceRefs.length ? plan.evidenceRefs.map((item) => `- ${item}`).join("\n") : "- 本次已确认的经营事实与确定性计算结果";
  const assumptions = plan.assumptions.length ? plan.assumptions.map((item) => `- ${item}`).join("\n") : "- 先把这条动作当作需要验证的假设，不把预期效果当成事实。";
  const risks = plan.contraindications.length ? plan.contraindications.map((item) => `- ${item}`).join("\n") : "- 未达到成功线时，不追加预算、不扩大范围。";
  return `# ${plan.title}

## 先解决什么
${plan.bottleneck}

## 为什么先做这件事
${plan.mechanism}

## 需要验证的假设
${plan.hypothesis}

## 已依据的事实
${refs}

## 具体怎么做
${plan.action}

## 执行边界
- 预算上限：¥${money.format(Number(plan.budgetCap) || 0)}
- 验证周期：${plan.durationDays} 天
- 观测指标：${plan.metric}
- 成功线：${plan.successLine}
- 停止线：${plan.stopLine}

## 前提与风险
${assumptions}
${risks}

## 最快证伪方式
${plan.falsification}`;
}

function renderMarkdown(source) {
  const escape = (text) => text.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char]));
  const inline = (text) => escape(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
  const lines = String(source || "").split("\n");
  const html = [];
  let listType = null;
  const closeList = () => { if (listType) { html.push(`</${listType}>`); listType = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const ordered = line.match(/^\d+\.\s+(.*)$/);
    const unordered = line.match(/^[-*]\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (unordered) {
      if (listType !== "ul") { closeList(); html.push("<ul>"); listType = "ul"; }
      html.push(`<li>${inline(unordered[1])}</li>`);
    } else if (ordered) {
      if (listType !== "ol") { closeList(); html.push("<ol>"); listType = "ol"; }
      html.push(`<li>${inline(ordered[1])}</li>`);
    } else if (line) {
      closeList();
      html.push(`<p>${inline(line)}</p>`);
    } else {
      closeList();
    }
  }
  closeList();
  return html.join("");
}

function openPlanDetail(plan) {
  $("planDetailTitle").textContent = plan.title;
  $("planDetailMarkdown").innerHTML = renderMarkdown(planMarkdown(plan));
  const dialog = $("planDetailDialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function renderResultFactEvidence() {
  const facts = reviewableFacts();
  const confirmed = facts.filter((fact) => fact.status === "confirmed").length;
  const provisional = facts.filter((fact) => fact.status === "provisional" || fact.status === "assumption").length;
  const unknown = facts.filter((fact) => fact.status === "unknown" || fact.status === "conflict").length;
  const locationState = state.locationConfirmed ? "位置已确认" : "位置待确认";
  $("resultFactSummary").textContent = `本案卷有 ${confirmed} 项已确认、${provisional} 项暂定、${unknown} 项未知；${locationState}。未知项没有被按 0 计入计算。`;
  const priority = [...facts].sort((a, b) => {
    const score = (fact) => fact.status === "confirmed" ? 0 : fact.status === "unknown" ? 2 : 1;
    return score(a) - score(b);
  }).slice(0, 8);
  $("resultFactList").innerHTML = priority.length ? priority.map((fact) => {
    const stateLabel = fact.status === "confirmed" ? "已确认" : fact.status === "unknown" ? "未知" : "待确认";
    return `<article><span>${escapeHtml(fact.label || FACT_LABELS[fact.id] || fact.id)}</span><b>${escapeHtml(formatFact(fact))}</b><small>${escapeHtml(stateLabel)} · ${escapeHtml(fact.source || "系统整理")}</small></article>`;
  }).join("") : "<p>暂时没有可展示的事实；请先完成问诊与纠偏。</p>";
}

function renderPreopenRecommendation(data, assessment, plans) {
  const result = $("result");
  const view = $("preopenRecommendation");
  const geo = data.geo || {};
  const metrics = Array.isArray(data.siteMetrics) ? data.siteMetrics.slice(0, 3) : [];
  const primary = plans[0];
  const decisionLabels = { GO: "值得进一步考察", TEST: "先小成本验证", STOP: "不建议直接签约" };
  const decision = decisionLabels[assessment.decision] || "先小成本验证";
  const address = [geo.city, geo.district, geo.address].filter((value, index, all) => value && all.indexOf(value) === index).join(" · ") || "已确认位置";
  const explanation = data.rankingNarrative || data.narrative?.body || assessment.reason || "地图只提供环境线索，品类排序必须由现场验证决定。";
  const rankLabels = ["首选", "次选", "第三选择"];
  const rankCards = plans.map((plan, index) => {
    const rank = String(index + 1).padStart(2, "0");
    return `<article class="preopen-rank-card ${index === 0 ? "is-primary" : ""}" data-testid="preopen-rank-${index + 1}">
      <header>
        <div class="preopen-rank-number"><span>${escapeHtml(rankLabels[index])}</span><b>${rank}</b></div>
        <div><span class="section-kicker">${escapeHtml(plan.bottleneck)}</span><h3>${escapeHtml(plan.title)}</h3></div>
      </header>
      <div class="preopen-rank-order"><b>为什么排在这里</b><p>${escapeHtml(plan.rankReason)}</p></div>
      <dl class="preopen-rank-reasons">
        <div><dt>为什么适合</dt><dd>${escapeHtml(plan.mechanism)}</dd></div>
        <div><dt>竞争怎么判断</dt><dd>${escapeHtml(plan.competitionReason)}</dd></div>
        <div><dt>成立前提</dt><dd>${escapeHtml(plan.operatingRequirement)}</dd></div>
      </dl>
      <div class="preopen-rank-validate">
        <div><span>先做什么</span><p>${escapeHtml(plan.action)}</p></div>
        <div class="preopen-validate-meta"><span>${escapeHtml(plan.durationDays)} 天验证</span><span>预算上限 ¥${money.format(Number(plan.budgetCap) || 0)}</span><span>观察：${escapeHtml(plan.metric)}</span></div>
        <div class="preopen-rank-risk"><b>最大风险</b><p>${escapeHtml(plan.risk)}</p><small>成功：${escapeHtml(plan.successLine)}　停止：${escapeHtml(plan.stopLine)}</small></div>
      </div>
    </article>`;
  }).join("");
  const metricHtml = metrics.map((metric) => `<div><span>${escapeHtml(metric.label)}</span><b>${escapeHtml(metric.value)}</b></div>`).join("");
  view.innerHTML = `<header class="preopen-ranking-hero">
    <div class="preopen-kicker"><span>选址品类排序</span><small>${escapeHtml(address)}</small></div>
    <p class="preopen-decision">地图初判：${escapeHtml(decision)}</p>
    <h2>如果继续考察，<em>先看 A · ${escapeHtml(primary?.title || "首选品类")}</em></h2>
    <p>这不是直接签约建议。下面是基于当前环境线索给出的相对顺序：先做哪个，再看哪个，最后才考虑哪个。</p>
    <div class="preopen-signal-row">${metricHtml}</div>
  </header>
  <section class="preopen-ranking-explanation">
    <div><span class="section-kicker">AI 的整体解释</span><h3>为什么 A 在 B 前，B 又在 C 前</h3></div>
    <p>${escapeHtml(explanation)}</p>
    <small>地图 POI 只证明周边存在什么，不等于真实人流、营业额或租金。</small>
  </section>
  <section class="preopen-ranking-list">
    <div class="preopen-ranking-list-heading"><div><span class="section-kicker">按优先级展开</span><h3>三个品类，三套不同的成立条件</h3></div><p>每一项都必须先被现场证伪，而不是直接投入。</p></div>
    ${rankCards}
  </section>`;
  result.classList.add("preopen-recommendation-mode");
  view.hidden = false;
  $("resultLeaderboard").hidden = true;
}

function renderAnalysisResult(data) {
  setProductView("result");
  setPanel("result");
  $("analysisFailure").hidden = true;
  $("analysisProgress").hidden = true;
  $("result").hidden = false;
  const assessment = data.deterministic || data.assessment || data;
  const metrics = assessment.metrics || {};
  const isSite = data.reportMode === "site-map";
  const plans = (data.topPlans || data.top3 || data.plans || []).slice(0, isSite ? 3 : 2).map(normalizePlan);
  const isPreopenRecommendation = isSite && data.reportType === "recommend" && plans.length > 0;
  $("result").classList.toggle("preopen-recommendation-mode", isPreopenRecommendation);
  $("preopenRecommendation").hidden = !isPreopenRecommendation;
  if (isPreopenRecommendation) {
    renderPreopenRecommendation(data, assessment, plans);
    return;
  }
  $("resultLeaderboard").hidden = true;
  const decisionLabels = isSite
    ? { GO: "值得开", TEST: "先小成本验证", STOP: "不建议开", EXIT: "不建议开", EVIDENCE: "先小成本验证" }
    : { GO: "可以继续", TEST: "小步验证", STOP: "停止追加", EXIT: "准备退出", EVIDENCE: "小步验证" };
  $("decisionCode").textContent = decisionLabels[assessment.decision] || (isSite ? "先小成本验证" : "小步验证");
  $("decisionTitle").textContent = assessment.title || "先补证据，再做决定";
  $("decisionReason").textContent = assessment.reason || "系统没有获得足够证据形成精确经营结论。";

  let metricCards = [];
  if (isSite && Array.isArray(data.siteMetrics) && data.siteMetrics.length) {
    metricCards = data.siteMetrics.map((metric) => [metric.label, metric.value, ""]);
  } else {
    if (Number.isFinite(metrics.breakEvenDaily)) {
      metricCards.push(["日保本营业额", `¥${money.format(metrics.breakEvenDaily)}`, Number.isFinite(metrics.breakEvenOrders) ? `约 ${Math.ceil(metrics.breakEvenOrders)} 单/天` : ""]);
    }
    if (Number.isFinite(metrics.monthlyProfit)) {
      metricCards.push(["每月经营结果", `${metrics.monthlyProfit < 0 ? "−" : "+"}¥${money.format(Math.abs(metrics.monthlyProfit))}`, "按保守边界计算"]);
    }
    if (metrics.runway === Infinity) metricCards.push(["现金寿命", "正现金流", "按当前口径"]);
    else if (Number.isFinite(metrics.runway)) metricCards.push(["现金寿命", `${metrics.runway.toFixed(1)} 个月`, "不包含未来新增投入"]);
    while (metricCards.length < 3) metricCards.push(["仍需确认", "待补数据", "未知不会被当成 0"]);
  }
  $("resultMetrics").innerHTML = metricCards.slice(0, 3).map(([label, value, hint]) => `
    <article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${hint ? `<small>${escapeHtml(hint)}</small>` : ""}</article>
  `).join("");

  const evidenceTasks = (data.evidence_tasks || []).slice(0, 1).map(normalizePlan);
  const narrative = data.narrative || data.explanation || {};
  const siteDirections = isSite && data.reportType === "recommend"
    ? plans.map((plan) => `${plan.bottleneck.replace(/^推荐/, "")} · ${plan.title}`).join("　")
    : "";
  if (siteDirections) {
    $("decisionTitle").textContent = "优先验证这 3 个方向";
    $("decisionReason").textContent = siteDirections;
    $("narrative").innerHTML = `<h3>为什么是这 3 个方向</h3><div class="site-direction-list">${plans.map((plan) => `<p><b>${escapeHtml(plan.bottleneck.replace(/^推荐/, ""))} · ${escapeHtml(plan.title)}</b><span>${escapeHtml(plan.mechanism || plan.action)}</span></p>`).join("")}</div>`;
  } else {
    $("narrative").innerHTML = `<h3>${escapeHtml(narrative.title || narrative.headline || "为什么这样判断")}</h3><p>${escapeHtml(narrative.body || narrative.diagnosis || assessment.reason || "")}</p>`;
  }
  renderResultFactEvidence();
  $("candidateCount").textContent = isSite
    ? (data.reportType === "recommend" ? "按客群与竞争排序的 3 个方向" : "落地与验证建议")
    : (plans.length > 1 ? "主方案 + 已核验备选" : plans.length ? "主方案" : "");
  // Site cards recommend a category (title) and must explain *why that category
  // fits here* in the body, then keep the verification action clearly labelled.
  // The old layout put a generic (and often identical) verification action under
  // each heading, so heading and body looked mismatched.
  const siteCard = (plan, index) => `
    <article class="plan-card site-plan" data-testid="plan-${index + 1}" data-plan-id="${escapeHtml(plan.id)}">
      <div class="plan-rank"><span>${escapeHtml(plan.bottleneck)}</span></div>
      <h4>${escapeHtml(plan.title)}</h4>
      <p>${escapeHtml(plan.mechanism || plan.action)}</p>
      <div class="plan-meta">
        <div><span>验证预算</span><b>¥${money.format(Number(plan.budgetCap) || 0)}</b></div>
        <div><span>验证周期</span><b>${escapeHtml(plan.durationDays)} 天</b></div>
        <div><span>观测指标</span><b>${escapeHtml(plan.metric)}</b></div>
      </div>
      <div class="plan-lines"><b>怎么验证：</b>${escapeHtml(plan.action)}<br><b>成功线：</b>${escapeHtml(plan.successLine)}<br><b>停止线：</b>${escapeHtml(plan.stopLine)}</div>
      <button type="button" class="plan-detail" data-plan-index="${index}">查看落地细节</button>
    </article>
  `;
  const diagnosisCard = (plan, index) => `
    <article class="plan-card" data-testid="plan-${index + 1}" data-plan-id="${escapeHtml(plan.id)}">
      <div class="plan-rank"><span>${index === 0 ? "主方案" : "备选方案"} · ${escapeHtml(plan.bottleneck)}</span></div>
      <h4>${escapeHtml(plan.title)}</h4>
      <p>${escapeHtml(plan.action)}</p>
      <div class="plan-meta">
        <div><span>预算上限</span><b>¥${money.format(Number(plan.budgetCap) || 0)}</b></div>
        <div><span>验证周期</span><b>${escapeHtml(plan.durationDays)} 天</b></div>
        <div><span>观测指标</span><b>${escapeHtml(plan.metric)}</b></div>
      </div>
      <div class="plan-lines"><b>成功线：</b>${escapeHtml(plan.successLine)}<br><b>停止线：</b>${escapeHtml(plan.stopLine)}</div>
      <button type="button" class="plan-detail" data-plan-index="${index}">查看详细方案</button>
    </article>
  `;
  $("planList").innerHTML = plans.length ? plans.map((plan, index) => (isSite ? siteCard : diagnosisCard)(plan, index)).join("") : evidenceTasks.length ? `
    <p>当前没有方案通过双重核验。下面只是补证据任务，不计分、不标 TOP，也不等于经营建议。</p>
    ${evidenceTasks.map((task) => `
      <article class="plan-card evidence-task">
        <div class="plan-rank"><span>补证据任务 · ${escapeHtml(task.bottleneck)}</span></div>
        <h4>${escapeHtml(task.title)}</h4>
        <p>${escapeHtml(task.action)}</p>
        <div class="plan-lines"><b>成功线：</b>${escapeHtml(task.successLine)}<br><b>停止线：</b>${escapeHtml(task.stopLine)}</div>
      </article>
    `).join("")}
  ` : "<p>当前没有方案通过硬核验。先补证据，比凑三个建议更可靠。</p>";
  $("planList").querySelectorAll(".plan-detail").forEach((button) => {
    button.addEventListener("click", () => openPlanDetail(plans[Number(button.dataset.planIndex)]));
  });
  if (isSite) {
    const caution = data.explanation?.caution || "地图只提供环境证据，正式投入前必须现场核对客群与竞争。";
    $("rejectedReasons").innerHTML = `<p>· ${escapeHtml(caution)}</p>`;
  } else {
    const rejected = data.rejectedReasons || (data.rejected || []).slice(0, 6).map((item) => (
      item.reasons?.[0] || item.phase || "未通过硬核验"
    ));
    $("rejectedReasons").innerHTML = rejected.length
      ? rejected.map((reason) => `<p>· ${escapeHtml(reason)}</p>`).join("")
      : "<p>候选方案因证据不足、财务不成立、不可逆或无法测量而被淘汰。</p>";
  }
  void publishAnonymousCaseIfEligible();
  void loadResultLeaderboard();
}

async function publishAnonymousCaseIfEligible() {
  if (state.localMode || !state.caseId || !state.caseToken) return;
  const key = `shoplooker-public:${state.caseId}`;
  const savedRaw = localStorage.getItem(key);
  if (savedRaw) {
    try {
      const saved = JSON.parse(savedRaw);
      if (saved.publicId) {
        let snapshot = saved.snapshot;
        if (!snapshot) {
          const current = await fetchJson(`/api/public-cases/${encodeURIComponent(saved.publicId)}`, {}, 8000);
          snapshot = current;
          localStorage.setItem(key, JSON.stringify({ ...saved, snapshot }));
        }
        state.publicShare = { publicId: saved.publicId, manageToken: saved.manageToken, snapshot };
        attachPublicShareActions(key);
        return;
      }
    } catch (_) {
      localStorage.removeItem(key);
    }
  }
  try {
    const data = await fetchJson(`/api/cases/${encodeURIComponent(state.caseId)}/publish`, {
      method: "POST", headers: caseHeaders({ "Content-Type": "application/json" }), body: "{}"
    }, 10000);
    if (data.publicId && data.manageToken) {
      state.publicShare = { publicId: data.publicId, manageToken: data.manageToken, snapshot: data.snapshot || {} };
      localStorage.setItem(key, JSON.stringify(state.publicShare));
      $("candidateCount").textContent = `${$("candidateCount").textContent} · 已匿名发布`;
      attachPublicShareActions(key);
    }
  } catch (_) {
    // Publishing is optional and never blocks the private result.
  }
}

function publicCaseUrl(publicId) {
  return `${window.location.origin}/case/${encodeURIComponent(publicId)}/`;
}

function attachPublicShareActions(storageKey) {
  const actions = $("result")?.querySelector(".result-actions");
  if (!actions || !state.publicShare?.publicId) return;
  actions.querySelector("[data-public-share]")?.remove();
  actions.querySelector("[data-public-unpublish]")?.remove();

  const shareButton = document.createElement("button");
  shareButton.type = "button";
  shareButton.className = "secondary-button";
  shareButton.dataset.publicShare = "true";
  shareButton.textContent = "打印 / 分享判断票";
  shareButton.addEventListener("click", openShareReceipt);

  const unpublishButton = document.createElement("button");
  unpublishButton.type = "button";
  unpublishButton.className = "secondary-button";
  unpublishButton.dataset.publicUnpublish = "true";
  unpublishButton.textContent = "下架匿名案例";
  unpublishButton.addEventListener("click", async () => {
    const saved = state.publicShare;
    if (!saved?.publicId || !saved.manageToken) return;
    unpublishButton.disabled = true;
    try {
      await fetchJson(`/api/public-cases/${encodeURIComponent(saved.publicId)}`, {
        method: "DELETE", headers: { "X-Public-Manage-Token": saved.manageToken }
      }, 8000);
      localStorage.removeItem(storageKey);
      state.publicShare = null;
      shareButton.remove();
      unpublishButton.remove();
      $("candidateCount").textContent = $("candidateCount").textContent.replace(" · 已匿名发布", "");
    } catch (error) {
      unpublishButton.disabled = false;
      unpublishButton.textContent = error.message || "下架失败，请重试";
    }
  });
  actions.append(shareButton, unpublishButton);
}

function qrImageUrl(shareUrl) {
  // The QR service receives only the already-public random case URL. No
  // address, token, audio, transcript or financial record is encoded here.
  return `https://api.qrserver.com/v1/create-qr-code/?format=svg&margin=0&size=240x240&data=${encodeURIComponent(shareUrl)}`;
}

function shareSnapshotReceipt(snapshot, publicId) {
  const shareUrl = publicCaseUrl(publicId);
  const plans = Array.isArray(snapshot?.plans) ? snapshot.plans.slice(0, 2) : [];
  const signals = Array.isArray(snapshot?.signals) ? snapshot.signals.slice(0, 4) : [];
  return `
    <article class="share-receipt" data-share-url="${escapeHtml(shareUrl)}">
      <div class="share-receipt-meta"><span>店判 · ANONYMOUS CASE</span><span>${escapeHtml(publicId.slice(-10).toUpperCase())}</span></div>
      <div class="share-receipt-decision">
        <span>${escapeHtml(lbConclusion(snapshot))}</span>
        <h2>${escapeHtml(snapshot?.decisionTitle || lbConclusion(snapshot))}</h2>
        <p>${escapeHtml(snapshot?.decisionReason || snapshot?.statusLine || "已完成经营判断")}</p>
      </div>
      <div class="share-receipt-section">
        <b>匿名公开范围</b>
        <p>仅含脱敏后的经营信号与已核验方案；不含地址、录音、原始问诊和完整账目。</p>
      </div>
      ${signals.length ? `<div class="share-receipt-signals">${signals.map((signal) => `<div><span>${escapeHtml(signal.label)}</span><b>${escapeHtml(signal.value)}</b></div>`).join("")}</div>` : ""}
      ${plans.length ? `<div class="share-receipt-plans">${plans.map((plan, index) => `<div><span>${index === 0 ? "主方案" : "备选方案"} · ${escapeHtml(plan.bottleneck || "")}</span><b>${escapeHtml(plan.title)}</b><p>${escapeHtml(plan.action || "")}</p></div>`).join("")}</div>` : ""}
      <a class="share-receipt-qr" href="${escapeHtml(shareUrl)}" target="_blank" rel="noopener noreferrer" aria-label="打开匿名经营判断记录">
        <img src="${escapeHtml(qrImageUrl(shareUrl))}" alt="打开匿名经营判断记录的二维码">
        <span>扫码或点击查看匿名判断记录</span>
      </a>
      <a class="share-receipt-link" href="${escapeHtml(shareUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(shareUrl)}</a>
    </article>`;
}

function openShareReceipt() {
  const share = state.publicShare;
  const dialog = $("shareReceiptDialog");
  const body = $("shareReceiptBody");
  if (!share?.publicId || !dialog || !body) return;
  body.innerHTML = shareSnapshotReceipt(share.snapshot || {}, share.publicId);
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

async function copyShareReceiptLink() {
  const share = state.publicShare;
  const button = $("copyShareLink");
  if (!share?.publicId || !button) return;
  const url = publicCaseUrl(share.publicId);
  try {
    await navigator.clipboard.writeText(url);
    button.textContent = "链接已复制";
  } catch (_) {
    window.prompt("复制这条匿名分享链接：", url);
  }
  window.setTimeout(() => { button.textContent = "复制链接"; }, 1800);
}

async function printShareReceipt() {
  const qr = $("shareReceiptBody")?.querySelector("img");
  try { await qr?.decode?.(); } catch (_) { /* The visible URL remains usable if QR loading is slow. */ }
  window.print();
}

const LB_DECISION_CLASS = { GO: "go", TEST: "test", STOP: "stop", EXIT: "exit", EVIDENCE: "test" };
const LB_DECISION_LABEL = { GO: "可以继续", TEST: "小步验证", STOP: "停止追加", EXIT: "准备退出", EVIDENCE: "小步验证" };
const LB_SIGNAL_STATE = { confirmed: "已确认", provisional: "待确认", unknown: "未知", conflict: "有冲突" };
let resultLeaderboardCases = [];
let resultLeaderboardLoaded = false;

function lbConclusion(item) { return item.conclusion || LB_DECISION_LABEL[item.decision] || "小步验证"; }
function lbDecisionClass(item) { return LB_DECISION_CLASS[item.decision] || "test"; }

function lbMetricsMarkup(metrics) {
  if (!Array.isArray(metrics) || !metrics.length) return "";
  return `<div class="result-metrics">${metrics.slice(0, 3).map((metric) => `
    <article><span>${escapeHtml(metric.label)}</span><strong>${escapeHtml(metric.value)}</strong><small>${escapeHtml(metric.hint || "")}</small></article>
  `).join("")}</div>`;
}

function lbNarrativeMarkup(narrative) {
  if (!narrative || (!narrative.title && !narrative.body)) return "";
  return `<div class="narrative"><h3>${escapeHtml(narrative.title || "为什么这样判断")}</h3><p>${escapeHtml(narrative.body || "")}</p></div>`;
}

function lbSignalsMarkup(signals) {
  if (!Array.isArray(signals) || !signals.length) return "";
  const cards = signals.map((signal) => `<article><span>${escapeHtml(signal.label)}</span><b>${escapeHtml(signal.value)}</b><small>${escapeHtml(LB_SIGNAL_STATE[signal.status] || "系统整理")}</small></article>`).join("");
  return `<details class="result-fact-evidence taped-evidence-note" open>
    <summary>查看事实与核验依据</summary>
    <div><span class="section-kicker">本次判断基于什么</span><h3>先看已确认事实，再看结论。</h3><p>以下是本案已核验的关键经营信号（已做匿名处理，不含具体金额与身份信息）。</p></div>
    <div class="result-fact-list">${cards}</div>
  </details>`;
}

function lbPlansMarkup(plans) {
  if (!Array.isArray(plans) || !plans.length) return "";
  const cards = plans.slice(0, 2).map((plan, index) => `
    <article class="plan-card">
      <div class="plan-rank"><span>${index === 0 ? "主方案" : "备选方案"} · ${escapeHtml(plan.bottleneck || "")}</span></div>
      <h4>${escapeHtml(plan.title)}</h4>
      <p>${escapeHtml(plan.action)}</p>
      <div class="plan-meta">
        <div><span>预算上限</span><b>¥${money.format(Number(plan.budgetCap) || 0)}</b></div>
        <div><span>验证周期</span><b>${escapeHtml(plan.durationDays)} 天</b></div>
        <div><span>观测指标</span><b>${escapeHtml(plan.metric)}</b></div>
      </div>
      <div class="plan-lines"><b>成功线：</b>${escapeHtml(plan.successLine)}<br><b>停止线：</b>${escapeHtml(plan.stopLine)}</div>
    </article>`).join("");
  return `<div class="plans-heading"><div><h3>下一步方案</h3></div><span>${plans.length} 个已核验方案</span></div><div class="plan-list">${cards}</div>`;
}

function lbRejectedMarkup(reasons) {
  if (!Array.isArray(reasons) || !reasons.length) return "";
  return `<details class="rejected"><summary>为什么其他方案被淘汰</summary><div>${reasons.map((reason) => `<p>· ${escapeHtml(reason)}</p>`).join("")}</div></details>`;
}

function publicCaseTimestamp(value) {
  if (!value) return "公开案例";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "公开案例" : `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function renderPublicSharedCase(item) {
  const result = $("result");
  if (!result) return;
  const conclusion = lbConclusion(item);
  result.classList.add("public-case-result");
  result.hidden = false;
  result.innerHTML = `
    <div class="public-case-heading">
      <span class="section-kicker">匿名经营判断记录 · ${escapeHtml(publicCaseTimestamp(item.updatedAt || item.createdAt))}</span>
      <p>这是经公开门槛筛选后的脱敏快照；原始地址、录音、问诊文本、完整账目和案卷令牌均不会出现在这里。</p>
    </div>
    <div class="result-main">
      <div><span>${escapeHtml(conclusion)}</span><small>${escapeHtml(item.category || "餐饮")} · 匿名案例</small></div>
      <h2>${escapeHtml(item.decisionTitle || conclusion)}</h2>
      <p>${escapeHtml(item.decisionReason || item.statusLine || "这份记录只保留可公开的经营判断。")}</p>
    </div>
    <div class="public-case-score"><span>事实完整度</span><b>${Number.isFinite(Number(item.evidenceScore ?? item.dataScore)) ? `${Math.round(Number(item.evidenceScore ?? item.dataScore))}%` : "已核验"}</b><span>公开方案已通过核验</span></div>
    ${lbNarrativeMarkup(item.narrative)}
    ${lbSignalsMarkup(item.signals)}
    ${lbPlansMarkup(item.plans)}
    ${lbRejectedMarkup(item.rejectedReasons)}
    <div class="result-actions public-case-actions">
      <a class="secondary-button" href="/ranking">查看匿名案例榜</a>
      <a class="primary-button" href="/">判断自己的店</a>
    </div>`;
}

async function loadPublicSharedCase(publicId) {
  setProductView("result");
  setPanel("result", { scroll: false });
  $("analysisProgress").hidden = true;
  try {
    const item = await fetchJson(`/api/public-cases/${encodeURIComponent(publicId)}`, {}, 10000);
    renderPublicSharedCase(item);
  } catch (error) {
    const result = $("result");
    result.hidden = false;
    result.classList.add("public-case-result");
    result.innerHTML = `<div class="public-case-missing"><span class="section-kicker">匿名案例不可用</span><h2>这张判断票已失效，或已被下架。</h2><p>${escapeHtml(error.message || "请回到案例榜查看仍公开的记录。")}</p><div class="result-actions"><a class="primary-button" href="/ranking">返回匿名案例榜</a></div></div>`;
  }
}

function closeResultCaseDetail() {
  const dialog = $("caseDetailDialog");
  if (!dialog) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function openResultCaseDetail(index) {
  const item = resultLeaderboardCases[index];
  const dialog = $("caseDetailDialog");
  const body = $("caseDetailBody");
  if (!item || !dialog || !body) return;
  const loc = item.location || "位置未公开";
  const cat = item.category || "餐饮";
  const kicker = $("caseDetailKicker");
  if (kicker) kicker.textContent = `${loc} · ${cat}`;
  body.innerHTML = `
    <div class="result-main">
      <div><span>${escapeHtml(lbConclusion(item))}</span></div>
      <h2>${escapeHtml(item.decisionTitle || lbConclusion(item))}</h2>
      <p>${escapeHtml(item.decisionReason || item.statusLine || "")}</p>
    </div>
    ${lbMetricsMarkup(item.metrics)}
    ${lbNarrativeMarkup(item.narrative)}
    ${lbSignalsMarkup(item.signals)}
    ${lbPlansMarkup(item.plans)}
    ${lbRejectedMarkup(item.rejectedReasons)}
  `;
  body.scrollTop = 0;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function renderResultLeaderboardCards(cases) {
  const listEl = $("resultRankingList");
  if (!listEl) return;
  if (!cases.length) {
    listEl.innerHTML = "<p>还没有达到公开门槛的案例。</p>";
    return;
  }
  listEl.innerHTML = cases.map((item, index) => {
    const status = item.statusLine || item.status || item.decisionReason || "";
    const loc = item.location || "位置未公开";
    const cat = item.category ? ` · ${escapeHtml(item.category)}` : "";
    return `<article class="rank-card" data-index="${index}" role="button" tabindex="0" aria-label="查看${escapeHtml(loc)}案例详情">
      <div class="rank-card-top">
        <span class="rank-loc">${escapeHtml(loc)}${cat}</span>
        <span class="rank-badge rank-badge-${lbDecisionClass(item)}">${escapeHtml(lbConclusion(item))}</span>
      </div>
      <p class="rank-status">${escapeHtml(status)}</p>
      <div class="rank-card-foot">
        <span class="rank-hint">整体经营状况 · 我们的判断结果</span>
        <span class="rank-detail-link">查看详情 →</span>
      </div>
    </article>`;
  }).join("");
  listEl.querySelectorAll(".rank-card").forEach((card) => {
    const open = () => {
      const item = resultLeaderboardCases[Number(card.dataset.index)];
      if (item?.id) window.location.assign(`/case/${encodeURIComponent(item.id)}/`);
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
    });
  });
}

async function loadResultLeaderboard() {
  const section = $("resultLeaderboard");
  if (!section || resultLeaderboardLoaded) return;
  try {
    const data = await fetchJson("/api/leaderboard", {}, 10000);
    const cases = Array.isArray(data.cases) ? data.cases : [];
    if (!cases.length) return;
    resultLeaderboardCases = cases;
    renderResultLeaderboardCards(cases);
    section.hidden = false;
    resultLeaderboardLoaded = true;
  } catch (_) {
    // 案例榜是加分项，任何失败都不阻塞用户自己的结果。
  }
}

async function startSelectedPlan(planId, button) {
  if (!planId || state.localMode || !state.caseId) {
    button.textContent = "本地演示：请按预算和停止线执行";
    return;
  }
  button.disabled = true;
  button.textContent = "正在生成执行清单…";
  try {
    const data = await fetchJson(
      `/api/cases/${encodeURIComponent(state.caseId)}/plans/${encodeURIComponent(planId)}/start`,
      { method: "POST", headers: caseHeaders({ "Content-Type": "application/json" }), body: "{}" },
      10000
    );
    const card = button.closest(".plan-card");
    const existing = card.querySelector(".execution-checklist");
    if (existing) existing.remove();
    const panel = document.createElement("div");
    panel.className = "execution-checklist";
    panel.innerHTML = `<b>${escapeHtml(data.reviewAfterDays || 3)} 天后复查</b>${(data.checklist || []).map((item) => `<p>□ ${escapeHtml(item)}</p>`).join("")}`;
    card.append(panel);
    button.textContent = "方案已选定";
  } catch (error) {
    button.disabled = false;
    button.textContent = `生成失败：${error.message}`;
  }
}

function resetFlow() {
  clearInterval(state.analysisTimer);
  state.interview.turnController?.abort();
  state.audio?.stop();
  stopVoiceIo();
  Object.assign(state, {
    panel: "location",
    stage: null,
    caseId: null,
    caseToken: null,
    caseVersion: 1,
    firstQuestion: null,
    localMode: false,
    locationAttempt: state.locationAttempt + 1,
    locationCandidate: null,
    locationConfirmed: false,
    mapContextLoaded: false,
    facts: [],
    transcripts: [],
    reviewSubmitted: false,
    audio: null,
    recognition: null,
    ttsAudio: null,
    ttsController: null,
    analysisTimer: null
  });
  state.interview = {
    active: false, paused: false, complete: false, questionIndex: -1,
    turnId: null, mode: "pending", transcript: "", draft: "", draftEdited: false, draftSource: "",
    voiceBase: "",
    progress: { asked: 0, coreTarget: 6, maxTurns: 12 }, noSpeechCount: 0,
    submitInFlight: false, busy: false, asrController: null, turnController: null,
    finishRequested: false, pendingQuestion: null, history: []
  };
  document.querySelectorAll("[data-stage]").forEach((button) => button.classList.remove("selected"));
  $("category").value = "";
  $("manualLocation").value = "";
  $("mapSummary").hidden = true;
  $("locationProof").hidden = true;
  $("locationStatus").hidden = true;
  $("locationPanel").classList.remove("location-confirmed");
  $("confirmLocation").disabled = false;
  $("confirmLocation").textContent = "这是正确位置";
  $("beginInterview").disabled = true;
  $("result").hidden = true;
  $("analysisProgress").hidden = false;
  $("analysisFailure").hidden = true;
  $("previousQuestion").hidden = false;
  $("previousQuestion").disabled = true;
  $("confirmAnswer").disabled = false;
  $("submitReview").textContent = "确定提交";
  $("reviewFormStatus").textContent = "所有问题都列在这里，不会再用语音重问。";
  setProductView(DEMO_MODE ? "workspace" : "landing");
  setPanel("location");
  applyDefaultJudgeSetup();
}

document.querySelectorAll("[data-stage]").forEach((button) => {
  button.addEventListener("click", () => chooseStage(button.dataset.stage));
});
document.querySelectorAll("[data-category]").forEach((button) => {
  button.addEventListener("click", () => {
    $("category").value = button.dataset.category;
    syncCategoryChips();
  });
});
$("category").addEventListener("input", syncCategoryChips);
$("locateButton").addEventListener("click", locateCurrentStore);
$("useManualLocation").addEventListener("click", () => void useManualLocation());
$("mapPickerCanvas").addEventListener("click", chooseMapPickerPoint);
$("mapPickerCanvas").addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    const rect = $("mapPickerCanvas").getBoundingClientRect();
    chooseMapPickerPoint({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
  }
});
$("mapPickerRelocate").addEventListener("click", locateCurrentStore);
$("useMapPickerPoint").addEventListener("click", () => void useMapPickerPoint());
$("mapPickerImage").addEventListener("error", () => {
  if (!$("mapPicker").hidden) setLocationStatus("notice", "地图底图暂时未加载，但已找到地址；你仍可直接确认或重新定位。");
});
$("confirmLocation").addEventListener("click", confirmLocation);
$("editLocation").addEventListener("click", editLocation);
$("manualLocation").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void useManualLocation();
  }
});
$("beginInterview").addEventListener("click", () => void beginInterview());
$("previousQuestion").addEventListener("click", goToPreviousQuestion);
$("reviewForm").addEventListener("submit", (event) => {
  event.preventDefault();
  void submitReviewForm();
});
$("textFallback").addEventListener("submit", (event) => {
  event.preventDefault();
  void confirmAnswerDraft();
});
$("fallbackAnswer").addEventListener("input", () => {
  state.interview.draftEdited = true;
  state.interview.draft = $("fallbackAnswer").value;
  state.interview.draftSource = "typed";
});
$("startAnalysis").addEventListener("click", () => void startAnalysis());
$("restartButton").addEventListener("click", resetFlow);
$("analysisFailureBack").addEventListener("click", returnToLocationFromFailure);
$("closePlanDetail").addEventListener("click", () => $("planDetailDialog").close());
$("planDetailDialog").addEventListener("click", (event) => {
  if (event.target === $("planDetailDialog")) $("planDetailDialog").close();
});
$("closeCaseDetail")?.addEventListener("click", closeResultCaseDetail);
$("caseDetailDialog")?.addEventListener("click", (event) => {
  if (event.target === $("caseDetailDialog")) closeResultCaseDetail();
});
$("closeShareReceipt")?.addEventListener("click", () => $("shareReceiptDialog")?.close());
$("shareReceiptDialog")?.addEventListener("click", (event) => {
  if (event.target === $("shareReceiptDialog")) $("shareReceiptDialog").close();
});
$("copyShareLink")?.addEventListener("click", () => void copyShareReceiptLink());
$("printShareReceipt")?.addEventListener("click", () => void printShareReceipt());
document.querySelector("[data-testid=hero-start]").addEventListener("click", (event) => {
  event.preventDefault();
  if (DEMO_MODE) {
    enterWorkspace();
    return;
  }
  setProductView("workspace", { scroll: true });
});
document.querySelector(".brand").addEventListener("click", (event) => {
  if (DEMO_MODE || PUBLIC_CASE_MODE) return;
  event.preventDefault();
  setProductView("landing", { scroll: true });
});

configureDemoLanding();
if (PUBLIC_CASE_MODE) {
  void loadPublicSharedCase(PUBLIC_CASE_ID);
} else if (!DEMO_MODE) {
  setProductView("landing");
  applyDefaultJudgeSetup();
}

fetch("/data/corpus_analysis.json")
  .then((response) => response.ok ? response.json() : Promise.reject())
  .then((data) => {
    const setStat = (id, value) => { const el = $(id); if (el) el.textContent = value; };
    setStat("heroTitles", data.archive.manifest_unique_videos);
    setStat("headerTitles", data.archive.manifest_unique_videos);
    if (Number.isFinite(data.archive.accepted_transcripts)) {
      setStat("heroTranscripts", data.archive.accepted_transcripts);
      setStat("headerTranscripts", data.archive.accepted_transcripts);
    }
  })
  .catch(() => {});
