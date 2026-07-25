const list = document.getElementById("rankingList");
const dialog = document.getElementById("caseDetailDialog");
const detailBody = document.getElementById("caseDetailBody");
const detailKicker = document.getElementById("caseDetailKicker");
const closeButton = document.getElementById("closeCaseDetail");
const money = new Intl.NumberFormat("zh-CN");

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));

const DECISION_CLASS = { GO: "go", TEST: "test", STOP: "stop", EXIT: "exit", EVIDENCE: "test" };
const DECISION_LABEL = { GO: "可以继续", TEST: "小步验证", STOP: "停止追加", EXIT: "准备退出", EVIDENCE: "小步验证" };
const SIGNAL_STATE = { confirmed: "已确认", provisional: "待确认", unknown: "未知", conflict: "有冲突" };

function conclusionOf(item) {
  return item.conclusion || DECISION_LABEL[item.decision] || "小步验证";
}

function decisionClass(item) {
  return DECISION_CLASS[item.decision] || "test";
}

let currentCases = [];
let initialCasesRendered = false;

function renderCards(cases) {
  if (!cases.length) {
    list.innerHTML = "<p>还没有达到公开门槛的案例。</p>";
    return;
  }
  list.innerHTML = cases.map((item, index) => {
    const status = item.statusLine || item.status || item.decisionReason || "";
    const loc = item.location || "位置未公开";
    const cat = item.category ? ` · ${escapeHtml(item.category)}` : "";
    return `<article class="rank-card" data-index="${index}" role="button" tabindex="0" aria-label="查看${escapeHtml(loc)}案例详情">
      <div class="rank-card-top">
        <span class="rank-loc">${escapeHtml(loc)}${cat}</span>
        <span class="rank-badge rank-badge-${decisionClass(item)}">${escapeHtml(conclusionOf(item))}</span>
      </div>
      <p class="rank-status">${escapeHtml(status)}</p>
      <div class="rank-card-foot">
        <span class="rank-hint">整体经营状况 · 我们的判断结果</span>
        <span class="rank-detail-link">查看详情 →</span>
      </div>
    </article>`;
  }).join("");
  list.querySelectorAll(".rank-card").forEach((card) => {
    const open = () => {
      const item = currentCases[Number(card.dataset.index)];
      if (item?.id) window.location.assign(`/case/${encodeURIComponent(item.id)}/`);
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
    });
  });
}

function metricsMarkup(metrics) {
  if (!Array.isArray(metrics) || !metrics.length) return "";
  return `<div class="result-metrics">${metrics.slice(0, 3).map((metric) => `
    <article><span>${escapeHtml(metric.label)}</span><strong>${escapeHtml(metric.value)}</strong><small>${escapeHtml(metric.hint || "")}</small></article>
  `).join("")}</div>`;
}

function narrativeMarkup(narrative) {
  if (!narrative || (!narrative.title && !narrative.body)) return "";
  return `<div class="narrative"><h3>${escapeHtml(narrative.title || "为什么这样判断")}</h3><p>${escapeHtml(narrative.body || "")}</p></div>`;
}

function signalsMarkup(signals) {
  if (!Array.isArray(signals) || !signals.length) return "";
  const cards = signals.map((signal) => `<article><span>${escapeHtml(signal.label)}</span><b>${escapeHtml(signal.value)}</b><small>${escapeHtml(SIGNAL_STATE[signal.status] || "系统整理")}</small></article>`).join("");
  return `<details class="result-fact-evidence" open>
    <summary>查看事实与核验依据</summary>
    <div><span class="section-kicker">本次判断基于什么</span><h3>先看已确认事实，再看结论。</h3><p>以下是本案已核验的关键经营信号（已做匿名处理，不含具体金额与身份信息）。</p></div>
    <div class="result-fact-list">${cards}</div>
  </details>`;
}

function plansMarkup(plans) {
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

function rejectedMarkup(reasons) {
  if (!Array.isArray(reasons) || !reasons.length) return "";
  return `<details class="rejected"><summary>为什么其他方案被淘汰</summary><div>${reasons.map((reason) => `<p>· ${escapeHtml(reason)}</p>`).join("")}</div></details>`;
}

function openDetail(index) {
  const item = currentCases[index];
  if (!item) return;
  const loc = item.location || "位置未公开";
  const cat = item.category || "餐饮";
  detailKicker.textContent = `${loc} · ${cat}`;
  detailBody.innerHTML = `
    <div class="result-main">
      <div><span>${escapeHtml(conclusionOf(item))}</span></div>
      <h2>${escapeHtml(item.decisionTitle || conclusionOf(item))}</h2>
      <p>${escapeHtml(item.decisionReason || item.statusLine || "")}</p>
    </div>
    ${metricsMarkup(item.metrics)}
    ${narrativeMarkup(item.narrative)}
    ${signalsMarkup(item.signals)}
    ${plansMarkup(item.plans)}
    ${rejectedMarkup(item.rejectedReasons)}
  `;
  detailBody.scrollTop = 0;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeDetail() {
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

closeButton.addEventListener("click", closeDetail);
dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDetail(); });

async function loadLeaderboard() {
  try {
    const response = await fetch("/api/leaderboard");
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "案例榜暂时不可用");
    // Replacing the small loading line with a long list used to trigger browser
    // scroll anchoring: the page jumped past its title on the first load.
    // Preserve an intentional reader scroll, but keep a new visit at the top.
    const shouldStayAtTop = !initialCasesRendered && window.scrollY < 4;
    currentCases = Array.isArray(data.cases) ? data.cases : [];
    renderCards(currentCases);
    initialCasesRendered = true;
    if (shouldStayAtTop) requestAnimationFrame(() => window.scrollTo(0, 0));
  } catch (error) {
    list.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

void loadLeaderboard();
