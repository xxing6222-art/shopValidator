import assert from "node:assert/strict";
import { runSiteReport, fallbackSiteReport } from "./worker.mjs";

// Passing an env without STEPFUN_API_KEY makes createTextLlm() return null, so
// runSiteReport falls back to the deterministic rule-based report. That keeps
// these assertions stable without hitting any network.
const NO_LLM_ENV = {};

function makeRecord({ category, competitorCount, environment }) {
  return {
    category,
    location: {
      context: {
        location: { address: "浙江省杭州市余杭区礼贤路湖畔科创中心", city: "杭州市", district: "余杭区" },
        nearby: {
          keyword: "餐饮",
          count: competitorCount,
          places: Array.from({ length: Math.min(competitorCount, 5) }, (_, i) => ({
            title: `竞品${i + 1}`, category: "餐饮", distance: 100 + i * 30
          }))
        },
        landmarks: [{ title: "湖畔科创中心", category: "写字楼", distance: 60 }],
        environment
      }
    }
  };
}

const richEnvironment = [
  { label: "学校/大学", count: 3, nearestMeters: 220, samples: ["浙大城市学院"] },
  { label: "写字楼/公司", count: 6, nearestMeters: 80, samples: ["湖畔科创中心"] },
  { label: "住宅小区", count: 4, nearestMeters: 300, samples: ["某小区"] },
  { label: "地铁/公交", count: 2, nearestMeters: 400, samples: ["某地铁站"] },
  { label: "商场/超市", count: 1, nearestMeters: 500, samples: ["某商场"] }
];

const emptyEnvironment = [
  { label: "学校/大学", count: 0, nearestMeters: null, samples: [] },
  { label: "写字楼/公司", count: 0, nearestMeters: null, samples: [] },
  { label: "住宅小区", count: 0, nearestMeters: null, samples: [] },
  { label: "地铁/公交", count: 0, nearestMeters: null, samples: [] },
  { label: "商场/超市", count: 0, nearestMeters: null, samples: [] }
];

// 1) recommend mode: category "我不知道" -> 3 ranked category options A/B/C.
{
  const record = makeRecord({ category: "我不知道", competitorCount: 5, environment: richEnvironment });
  const result = await runSiteReport(record, NO_LLM_ENV, {});
  assert.equal(result.reportMode, "site-map");
  assert.equal(result.reportType, "recommend");
  assert.equal(result.category, "我不知道");
  assert.equal(result.topPlans.length, 3, "recommend should return 3 category options");
  assert.deepEqual(
    result.topPlans.map((p) => p.bottleneck),
    ["推荐A", "推荐B", "推荐C"],
    "recommend options must be ranked A>B>C"
  );
  // It still uses the shared data shape, but the browser renders it in a
  // dedicated ranked-category report rather than generic diagnosis cards.
  assert.ok(["GO", "TEST", "STOP"].includes(result.deterministic.decision));
  assert.equal(result.siteMetrics.length, 3, "always emit 3 metric cards");
  assert.equal(result.siteMetrics[0].label, "800米同类竞品");
  assert.equal("hint" in result.siteMetrics[0], false, "site metric cards should not render a misleading third text line");
  assert.ok(result.explanation.caution.includes("现场"), "caution must warn to verify on-site");
  assert.ok(result.narrative.title && result.narrative.body);
  // Each card renders `mechanism` (why this category fits) as its body, so every
  // option must carry a non-empty and distinct reason — otherwise the heading
  // (category) and body would look mismatched / repeated.
  const reasons = result.topPlans.map((p) => p.mechanism);
  reasons.forEach((why) => assert.ok(why && why.length > 4, "each recommend card needs a why/mechanism"));
  assert.equal(new Set(reasons).size, reasons.length, "recommend reasons must be distinct per category");
  const rankReasons = result.topPlans.map((p) => p.rankReason);
  rankReasons.forEach((reason) => assert.ok(reason && reason.length > 12, "each recommendation needs a comparative rank reason"));
  assert.equal(new Set(rankReasons).size, rankReasons.length, "ranking reasons must explain different positions");
  result.topPlans.forEach((plan) => {
    assert.ok(plan.competitionReason.length > 12, "each category needs a competition explanation");
    assert.ok(plan.operatingRequirement.length > 12, "each category needs an operating requirement");
    assert.ok(plan.risk.length > 12, "each category needs a falsifiable risk");
  });
  assert.ok(result.rankingNarrative.includes("首选") || result.rankingNarrative.includes("排序"), "recommend report needs an overall ordering explanation");
}

// 2) feasibility mode: a specific category -> validation steps, feasibility type.
{
  const record = makeRecord({ category: "现制茶饮", competitorCount: 5, environment: richEnvironment });
  const result = await runSiteReport(record, NO_LLM_ENV, {});
  assert.equal(result.reportType, "feasibility");
  assert.equal(result.category, "现制茶饮");
  assert.ok(result.topPlans.length >= 2 && result.topPlans.length <= 3);
  result.topPlans.forEach((plan) => assert.equal(plan.bottleneck, "落地验证"));
}

// 3) body.category overrides record.category.
{
  const record = makeRecord({ category: "我不知道", competitorCount: 5, environment: richEnvironment });
  const result = await runSiteReport(record, NO_LLM_ENV, { category: "咖啡" });
  assert.equal(result.reportType, "feasibility");
  assert.equal(result.category, "咖啡");
}

// 4) Decision rules: GO when competitors<=8 and crowd exists.
{
  const geo = { competitorCount: 5, environment: richEnvironment.map((g) => ({ ...g })) };
  const report = fallbackSiteReport(geo, "recommend", "我不知道");
  assert.equal(report.decision, "GO");
}

// 5) Decision rules: STOP when competitors are dense.
{
  const geo = { competitorCount: 22, environment: richEnvironment.map((g) => ({ ...g })) };
  const report = fallbackSiteReport(geo, "recommend", "我不知道");
  assert.equal(report.decision, "STOP");
}

// 6) Decision rules: STOP when there is no crowd signal at all.
{
  const geo = { competitorCount: 2, environment: emptyEnvironment.map((g) => ({ ...g })) };
  const report = fallbackSiteReport(geo, "recommend", "我不知道");
  assert.equal(report.decision, "STOP");
}

// 7) Decision rules: TEST for a mixed/mid signal (some competition, some crowd).
{
  const geo = {
    competitorCount: 12,
    environment: [
      { label: "学校/大学", count: 0, samples: [] },
      { label: "写字楼/公司", count: 2, samples: [] },
      { label: "住宅小区", count: 0, samples: [] },
      { label: "地铁/公交", count: 0, samples: [] },
      { label: "商场/超市", count: 0, samples: [] }
    ]
  };
  const report = fallbackSiteReport(geo, "recommend", "我不知道");
  assert.equal(report.decision, "TEST");
}

console.log("site report (map-driven preopen): recommend/feasibility + decision rules: all assertions passed");
