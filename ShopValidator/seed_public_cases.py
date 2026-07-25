#!/usr/bin/env python3
"""Generate the Shop Ranking List seed SQL for the D1 `public_cases` table.

The leaderboard shows anonymised snapshots curated from the public Bilibili
勇哥餐饮 corpus. Each snapshot is display-ready: the card only needs location,
the judgment conclusion and a one-line business status; the detail view reuses
the full analysis-result interface, so every row carries decisionTitle/reason,
metrics, narrative, signals, plans and rejectedReasons.

Selection deliberately keeps the conclusions diverse: constructive outcomes
(可以继续 / 小步验证) outnumber the stop/exit cases so the list is worth reading.

Usage:
    python seed_public_cases.py            # writes tmp/seed_public_cases.sql
Then apply with:
    wrangler d1 execute yongge-cases --remote --file=tmp/seed_public_cases.sql
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "tmp" / "seed_public_cases.sql"


def token_hash(seed_id: str) -> str:
    return hashlib.sha256(f"public-seed-manage::{seed_id}".encode("utf-8")).hexdigest()


# Each case: the snapshot is what /api/leaderboard returns and what the detail
# view renders. metrics/signals are already display-ready to stay decoupled from
# the private interview schema.
CASES = [
    # ---- 可以继续 (GO) — constructive, keeps the list worth reading ----
    {
        "id": "public-seed-laojiuguan", "bvid": "BV18ZVg6nE9s",
        "location": "江苏 · 扬州", "category": "老酒馆", "stage": "operating",
        "decision": "GO", "conclusion": "可以继续",
        "status": "14 年老店，月净利约 3 万，现金流健康、客群稳定",
        "title": "守住熟客盘，只加一档低风险动作",
        "reason": "老店的复购、毛利和固定成本都已确认，单位经济长期成立。现在的风险不是要不要做，而是别为了增长破坏原有的稳定结构，扩张动作必须可回收。",
        "metrics": [
            {"label": "日均营业额", "value": "¥3,000", "hint": "堂食为主，晚市占七成"},
            {"label": "每月经营结果", "value": "+¥30,000", "hint": "按保守边界计算"},
            {"label": "现金寿命", "value": "正现金流", "hint": "14 年稳定经营"},
        ],
        "narrative": {"title": "先稳住，再谨慎加一档",
                      "body": "扬州这家开了 14 年的老酒馆，靠熟客、稳定出品和低房租把单位经济做实了。老板想再往上走，但真正的机会是把晚市高峰的翻台和小份下酒菜做细，而不是盲目扩座或开分店。"},
        "signals": [
            {"label": "复购结构", "value": "以周边熟客为主，复购稳定", "status": "confirmed"},
            {"label": "毛利率", "value": "约 60%", "status": "confirmed"},
            {"label": "房租占比", "value": "老约租金低，占比健康", "status": "confirmed"},
        ],
        "plans": [
            {"role": "主方案", "bottleneck": "晚市高峰承接",
             "title": "把晚市高峰的翻台再压 15 分钟", "action": "连续两周记录晚市 18:00–21:00 的翻台时间与等位放弃数，只优化上菜顺序和小份下酒菜，不加座、不装修。",
             "budgetCap": 300, "durationDays": 14, "metric": "晚市翻台时间与放弃入店数",
             "successLine": "翻台平均缩短 15 分钟且客单不降，晚市营收升 10%。", "stopLine": "两周无改善就停止，不为翻台追加投入。"},
            {"role": "备选方案", "bottleneck": "淡季现金波动",
             "title": "把招牌下酒菜做成可外带套装", "action": "选 3 道最稳的下酒菜做真空外带装，只在店内和熟客群试卖 3 周，缺货即下架。",
             "budgetCap": 800, "durationDays": 21, "metric": "外带套装周销量与毛利",
             "successLine": "三周外带带来稳定增量且毛利不低于堂食。", "stopLine": "出品或口碑受影响立即撤回。"},
        ],
        "rejected": ["没有第二个点位的真实客流验证，不建议现在开分店。",
                     "熟客盘尚未做透，不把预算投到线上大额投流。"],
        "evidence": 88, "rank": 66, "date": "2026-07-24T09:00:00.000Z",
    },
    {
        "id": "public-seed-hotpot", "bvid": "BV1g2Kw63EKv",
        "location": "四川 · 成都", "category": "社区火锅店", "stage": "growth",
        "decision": "GO", "conclusion": "可以继续",
        "status": "月净利约 2 万且稳定，瓶颈是老板亲力过重、可复制性弱",
        "title": "先把老板从灶台解放，再谈复制",
        "reason": "店已经赚钱，真正的风险是增长绑在老板一个人身上。要放大就得先把出品和排班标准化，让门店在老板不在场时也能稳定运转,再考虑第二家。",
        "metrics": [
            {"label": "每月经营结果", "value": "+¥20,000", "hint": "已连续多月为正"},
            {"label": "老板工时", "value": "约 12 小时/天", "hint": "尚未计价的隐性成本"},
            {"label": "现金寿命", "value": "正现金流", "hint": "按当前口径"},
        ],
        "narrative": {"title": "赚钱但太累，先解决可复制性",
                      "body": "成都这家社区火锅月赚 2 万，老板却嫌太累——这恰恰说明利润里含着大量未计价的自身劳动。先把锅底、切配、排班标准化，验证门店离得开老板，再谈开分店或做线上曝光。"},
        "signals": [
            {"label": "盈利状态", "value": "月净利约 2 万，稳定", "status": "confirmed"},
            {"label": "出品依赖", "value": "关键环节依赖老板亲自把控", "status": "confirmed"},
            {"label": "排班", "value": "缺少可交接的标准流程", "status": "provisional"},
        ],
        "plans": [
            {"role": "主方案", "bottleneck": "增长绑定老板个人",
             "title": "两周做出可交接的出品与排班 SOP", "action": "把锅底、切配、开档收档写成清单，安排老板连续 3 天不上灶只观察，记录出品与营收波动。",
             "budgetCap": 200, "durationDays": 14, "metric": "老板不在场时的出品合格率与营收",
             "successLine": "老板不上灶 3 天，营收与出品稳定在平日九成以上。", "stopLine": "波动明显则先补 SOP，不急于扩张。"},
            {"role": "备选方案", "bottleneck": "线上曝光不足",
             "title": "小红书低成本内容测试 3 周", "action": "只用手机拍出餐与排队实景，每周 3 条，不投流，观察自然进店增量。",
             "budgetCap": 0, "durationDays": 21, "metric": "自然到店中提及线上的比例",
             "successLine": "三周内明显出现线上带来的新客。", "stopLine": "无自然增量就停更，不转付费投流。"},
        ],
        "rejected": ["门店尚未离得开老板，不建议直接签第二家店租约。",
                     "没有内容转化数据，不先投付费推广。"],
        "evidence": 84, "rank": 63, "date": "2026-07-24T08:30:00.000Z",
    },
    {
        "id": "public-seed-xiangcai-my", "bvid": "BV1o9MP6cEwP",
        "location": "马来西亚 · 吉隆坡", "category": "湘菜馆（海外）", "stage": "operating",
        "decision": "GO", "conclusion": "可以继续",
        "status": "海外华人客群稳定，回本速度快、毛利高",
        "title": "抓住回本窗口，锁定供应链再稳一步",
        "reason": "客群和毛利都被验证，回本速度可观。最大风险来自海外食材供应和汇率波动,先把核心原料的稳定与成本锁死,增长才不会被供应端拖垮。",
        "metrics": [
            {"label": "回本预期", "value": "较快", "hint": "客群与毛利均已验证"},
            {"label": "毛利率", "value": "约 55%", "hint": "海外定价空间较好"},
            {"label": "现金寿命", "value": "正现金流", "hint": "按当前口径"},
        ],
        "narrative": {"title": "回本快，但要先锁供应链",
                      "body": "在吉隆坡开的这家湘菜馆抓住了华人思乡口味，回本速度让勇哥都心动。它的软肋是海外食材供应和汇率——先把辣椒、腊味等核心原料的稳定供应和成本锁定,再谈加座或第二店。"},
        "signals": [
            {"label": "目标客群", "value": "本地华人 + 留学生，复购稳定", "status": "confirmed"},
            {"label": "回本速度", "value": "快于同类堂食", "status": "provisional"},
            {"label": "供应风险", "value": "核心食材依赖进口", "status": "confirmed"},
        ],
        "plans": [
            {"role": "主方案", "bottleneck": "海外供应链稳定性",
             "title": "锁定核心食材的两家备选供应", "action": "对辣椒、腊味等 5 项核心原料各找 2 家稳定供应并比价，签小额试单验证到货周期。",
             "budgetCap": 1500, "durationDays": 21, "metric": "核心原料到货稳定性与成本波动",
             "successLine": "核心原料具备双供应且成本波动可控。", "stopLine": "供应不稳先保出品，不扩菜单。"},
            {"role": "备选方案", "bottleneck": "高峰排队流失",
             "title": "高峰时段试行预约与拼桌", "action": "周末晚市试行预约与拼桌 3 周,记录排队放弃与翻台。",
             "budgetCap": 200, "durationDays": 21, "metric": "高峰放弃入店数",
             "successLine": "放弃入店下降且客单稳定。", "stopLine": "体验变差立即恢复原状。"},
        ],
        "rejected": ["供应链稳定性未验证前，不建议同城开第二家。",
                     "汇率与进口成本未对冲，不做大额囤货。"],
        "evidence": 80, "rank": 60, "date": "2026-07-23T15:00:00.000Z",
    },
    {
        "id": "public-seed-coffee-stall", "bvid": "BV1yLMA6ME3W",
        "location": "浙江 · 杭州", "category": "咖啡 + 小吃（摆摊转店）", "stage": "growth",
        "decision": "GO", "conclusion": "可以继续",
        "status": "从摆摊做到月赚 2 万+，客群与产品已被市场验证",
        "title": "延续被验证的产品，谨慎扩产能",
        "reason": "摆摊阶段就把产品和客群跑通了,转店后月赚 2 万+,说明需求真实。风险是转店后固定成本上升,要盯住新增房租是否被增量客流覆盖,而不是急着上新品。",
        "metrics": [
            {"label": "每月经营结果", "value": "+¥20,000", "hint": "摆摊转店后仍为正"},
            {"label": "获客", "value": "摊位期积累的老客", "hint": "复购基础好"},
            {"label": "现金寿命", "value": "正现金流", "hint": "按当前口径"},
        ],
        "narrative": {"title": "摆摊验证过的需求，转店后守住它",
                      "body": "杭州这位姑娘从摆摊卖咖啡小吃做到月赚 2 万+，产品力和客群已经过市场检验。转店后唯一要盯的是:新增的房租有没有被新增客流真正覆盖,别被'开店了要上很多新品'带偏节奏。"},
        "signals": [
            {"label": "产品验证", "value": "摆摊期已跑通爆款", "status": "confirmed"},
            {"label": "客群", "value": "有稳定复购的老客", "status": "confirmed"},
            {"label": "成本变化", "value": "转店后固定成本上升", "status": "provisional"},
        ],
        "plans": [
            {"role": "主方案", "bottleneck": "新增房租的覆盖",
             "title": "4 周核对新增房租是否被增量覆盖", "action": "分开记录到店新客与老客占比、日均营业额,核对新增固定成本是否被增量利润覆盖。",
             "budgetCap": 0, "durationDays": 28, "metric": "新增固定成本覆盖率",
             "successLine": "四周内增量利润稳定覆盖新增房租。", "stopLine": "长期覆盖不了就缩减面积或调整选址。"},
            {"role": "备选方案", "bottleneck": "爆款依赖单一",
             "title": "只测 1 款高毛利新品 2 周", "action": "围绕现有爆款延伸 1 款新品,小批量测试,不铺全线新菜单。",
             "budgetCap": 500, "durationDays": 14, "metric": "新品复购与毛利",
             "successLine": "新品有稳定复购且不拖累出餐。", "stopLine": "拉低出餐效率立即下架。"},
        ],
        "rejected": ["现金流虽正但缓冲有限，不建议立刻开第二家。",
                     "老客盘还能挖，不先做大额线上投放。"],
        "evidence": 79, "rank": 58, "date": "2026-07-23T14:00:00.000Z",
    },
    # ---- 小步验证 (TEST) ----
    {
        "id": "public-seed-roast-duck", "bvid": "BV1GoKH6KEn4",
        "location": "山东 · 济南", "category": "北京烤鸭（外卖为主）", "stage": "operating",
        "decision": "TEST", "conclusion": "小步验证",
        "status": "日收约 1600 几乎全靠外卖，毛利真实性待验证",
        "title": "先验证外卖毛利，再决定要不要扩单",
        "reason": "日收看着不错，但几乎全部来自外卖,扣掉平台扣点、包装和鸭子成本后的真实毛利还没算清。先把真实毛利跑出来,再决定投不投推广。",
        "metrics": [
            {"label": "日均营业额", "value": "¥1,600", "hint": "其中约 1500 来自外卖"},
            {"label": "外卖占比", "value": "约 94%", "hint": "堂食极少"},
            {"label": "实测毛利", "value": "待验证", "hint": "需扣平台扣点与包装"},
        ],
        "narrative": {"title": "先看高峰承接，不先扩店",
                      "body": "这家以外卖为主的烤鸭店,日收 1600 里约 1500 来自外卖。真正要回答的是:扣掉平台扣点、包装和鸭子成本后还剩多少毛利。先用 14 天把真实毛利跑出来,再谈扩单或改门头。"},
        "signals": [
            {"label": "渠道结构", "value": "外卖为主，日收 1600 中约 1500 来自外卖", "status": "confirmed"},
            {"label": "人员", "value": "2 人", "status": "confirmed"},
            {"label": "变动成本率", "value": "约 42%", "status": "provisional"},
        ],
        "plans": [
            {"role": "主方案", "bottleneck": "毛利真实性未知",
             "title": "先验证毛利真实性", "action": "连续 14 天记录每单实收,扣除平台扣点、包装与鸭子成本后重算毛利,抽样 30 单。",
             "budgetCap": 0, "durationDays": 14, "metric": "实测毛利率",
             "successLine": "实测毛利不低于 45% 且日均单量稳定在 20 单以上,再投入扩单。", "stopLine": "实测毛利低于 35%,先改定价与套餐结构,不投任何推广。"},
            {"role": "备选方案", "bottleneck": "门头可见性弱",
             "title": "门头可见性改造", "action": "关掉闪烁灯条,换静态灯箱与价格橱窗贴,晚高峰做 3 天路过问卷。",
             "budgetCap": 600, "durationDays": 14, "metric": "自然进店量",
             "successLine": "两周内自然进店与下单量明显上升。", "stopLine": "两周无变化即停止,不追加装修。"},
        ],
        "rejected": ["真实毛利未验证前，不投任何付费推广。",
                     "没有堂食转化数据，不盲目扩大堂食面积。"],
        "evidence": 78, "rank": 55, "date": "2026-07-23T09:00:00.000Z",
    },
    {
        "id": "public-seed-coffee-ready", "bvid": "BV1cNNQ68Et8",
        "location": "江苏 · 苏州", "category": "咖啡店（筹备开店）", "stage": "preopen",
        "decision": "TEST", "conclusion": "小步验证",
        "status": "选址与预算准备充分，主要风险是每天 12 小时的体力持续性",
        "title": "开店前先做一周体力与客流实测",
        "reason": "老板的账和选址准备得很扎实,勇哥都挑不出大毛病。唯一没被验证的是'每天 12 小时'能不能长期扛住,以及目标点位真实客流。用一周低成本实测把这两点跑清楚再签约。",
        "metrics": [
            {"label": "筹备完整度", "value": "较高", "hint": "选址、预算已想清楚"},
            {"label": "关键风险", "value": "12 小时/天体力", "hint": "长期可持续性未验证"},
            {"label": "点位客流", "value": "待实测", "hint": "需现场计数"},
        ],
        "narrative": {"title": "准备很足，就差两项实测",
                      "body": "这位准备开咖啡店的老板功课做得足,连勇哥想开喷都哑火。真正没被验证的是两件事:一是每天 12 小时的强度能不能长期扛,二是目标点位的真实进店客流。签约前用一周把它们测出来,风险就可控了。"},
        "signals": [
            {"label": "选址准备", "value": "已锁定候选点位并算过账", "status": "confirmed"},
            {"label": "体力投入", "value": "预计每天约 12 小时", "status": "confirmed"},
            {"label": "点位客流", "value": "尚未现场计数", "status": "unknown"},
        ],
        "plans": [
            {"role": "主方案", "bottleneck": "点位真实客流未知",
             "title": "候选点位做 5 天路过与进店计数", "action": "在目标点位的工作日与周末各选时段,人工记录路过人数、进店率与咖啡消费画像,不先交定金。",
             "budgetCap": 0, "durationDays": 5, "metric": "点位有效进店客流",
             "successLine": "实测进店客流能支撑保本单量。", "stopLine": "客流明显不足就换点位,不为情怀签约。"},
            {"role": "备选方案", "bottleneck": "长时体力持续性",
             "title": "先在现有工作外模拟一周高强度", "action": "连续一周模拟开店作息,评估体力与家庭支持,再决定是否全职投入。",
             "budgetCap": 0, "durationDays": 7, "metric": "可持续作息评估",
             "successLine": "一周后仍可稳定支撑该强度。", "stopLine": "扛不住就调整经营模式或合伙。"},
        ],
        "rejected": ["点位客流未实测前，不交转让费或定金。",
                     "体力可持续性未验证，不贸然辞职全职投入。"],
        "evidence": 74, "rank": 52, "date": "2026-07-23T08:00:00.000Z",
    },
    {
        "id": "public-seed-good-spot", "bvid": "BV1NK7V6tEw4",
        "location": "陕西 · 西安", "category": "小吃店（捡漏好铺）", "stage": "preopen",
        "decision": "TEST", "conclusion": "小步验证",
        "status": "位置确实好，但要防止为好位置支付过高溢价",
        "title": "好位置也要用保本单量验证，别为溢价买单",
        "reason": "捡到好位置是真优势,但好位置常伴随高租金和高转让费。先把这个点位的保本单量算清,再对比周边真实客流,确认好位置能转化成好生意,而不是好负担。",
        "metrics": [
            {"label": "点位质量", "value": "较好", "hint": "人流与可见性佳"},
            {"label": "保本单量", "value": "待核算", "hint": "取决于最终租金"},
            {"label": "溢价风险", "value": "需警惕", "hint": "好铺常伴高转让费"},
        ],
        "narrative": {"title": "位置好是优势，不是免死金牌",
                      "body": "小伙捡到一个好位置,勇哥也说恭喜。但好位置最容易让人放松算账——高人流往往对应高租金和高转让费。先把这个点位在目标租金下的保本单量算清,再用几天客流实测验证,好位置才真正变成好生意。"},
        "signals": [
            {"label": "位置", "value": "人流与可见性俱佳", "status": "confirmed"},
            {"label": "租金/转让费", "value": "待最终确认", "status": "provisional"},
            {"label": "保本单量", "value": "尚未核算", "status": "unknown"},
        ],
        "plans": [
            {"role": "主方案", "bottleneck": "租金溢价与保本线",
             "title": "按目标租金算清保本单量再谈价", "action": "用候选品类的客单与毛利,在最终租金下算出日保本单量,对照周边同类店的真实单量。",
             "budgetCap": 0, "durationDays": 3, "metric": "日保本单量与周边可达单量差",
             "successLine": "周边可达单量明显高于保本线。", "stopLine": "保本线接近或高于可达单量,压价或放弃。"},
            {"role": "备选方案", "bottleneck": "品类匹配",
             "title": "用 3 天摊点测试品类接受度", "action": "在该位置附近以低成本摊点方式试卖候选品类,验证真实购买意愿。",
             "budgetCap": 500, "durationDays": 3, "metric": "试卖转化与复问率",
             "successLine": "试卖转化良好,支持正式开店。", "stopLine": "无人问津就换品类或换点位。"},
        ],
        "rejected": ["保本单量未算清前，不接受高额转让费。",
                     "品类接受度未验证，不一次性投入重装修。"],
        "evidence": 73, "rank": 50, "date": "2026-07-22T16:00:00.000Z",
    },
    {
        "id": "public-seed-baoma-sugar", "bvid": "BV1bYLM62Ekh",
        "location": "广东 · 佛山", "category": "二次元糖水店（筹备）", "stage": "preopen",
        "decision": "TEST", "conclusion": "小步验证",
        "status": "日销要到 1600 才保本，主题客群规模尚未验证",
        "title": "先验证主题客群到不到日销 1600 保本线",
        "reason": "宝妈想减轻家里负担值得尊重,但二次元糖水的主题客群偏窄,而算下来日销要到 1600 才保本。先低成本验证这个客群在目标商圈的真实规模,再决定投入。",
        "metrics": [
            {"label": "日保本营业额", "value": "¥1,600", "hint": "达不到即亏损"},
            {"label": "客群宽度", "value": "偏窄（主题向）", "hint": "规模待验证"},
            {"label": "投入动机", "value": "减轻家庭负担", "hint": "更需控制风险"},
        ],
        "narrative": {"title": "情怀要落到保本线上",
                      "body": "二胎宝妈想开二次元糖水补贴家用。难点是:主题店客群窄,而保本要求日销 1600。开店前先用快闪或社群预售验证本地二次元人群规模,别让家庭的钱去赌一个未被验证的窄众需求。"},
        "signals": [
            {"label": "保本日销", "value": "约 1600 元", "status": "confirmed"},
            {"label": "目标客群", "value": "本地二次元人群，规模未知", "status": "unknown"},
            {"label": "风险承受", "value": "家庭资金，需谨慎", "status": "confirmed"},
        ],
        "plans": [
            {"role": "主方案", "bottleneck": "主题客群规模未知",
             "title": "两周社群预售 + 一次快闪验证需求", "action": "先在本地二次元社群做预售登记与一次周末快闪,统计真实付费人数与客单,不先租店。",
             "budgetCap": 800, "durationDays": 14, "metric": "预售/快闪的付费人数与客单",
             "successLine": "折算日销可稳定达到 1600 保本线。", "stopLine": "折算达不到保本线就不开实体店。"},
            {"role": "备选方案", "bottleneck": "固定成本过高",
             "title": "改用低租金小档口或共享空间", "action": "评估夜市档口或共享餐饮空间,把保本线拉低到日销 800 以内。",
             "budgetCap": 0, "durationDays": 7, "metric": "可行点位的保本日销",
             "successLine": "找到保本线可达的低成本点位。", "stopLine": "无低成本方案则暂缓开店。"},
        ],
        "rejected": ["主题客群规模未验证前，不签正价商铺租约。",
                     "保本日销偏高，不做重装修投入。"],
        "evidence": 72, "rank": 48, "date": "2026-07-22T15:00:00.000Z",
    },
    {
        "id": "public-seed-transfer-master", "bvid": "BV1EoSSBwEfZ",
        "location": "福建 · 厦门", "category": "小吃店（低价接铺）", "stage": "preopen",
        "decision": "TEST", "conclusion": "小步验证",
        "status": "守 1 年把转让费从 8 万磨到 2 万，成本控制到位",
        "title": "低成本接铺已成，开业前验证品类与客流",
        "reason": "为选址守了一年、把转让费从 8 万砍到 2 万,这个成本纪律是真本事,开店风险被大幅压低。剩下要做的是把品类和该点位客流对齐,开业不至于起步就错。",
        "metrics": [
            {"label": "转让费", "value": "¥20,000", "hint": "从 8 万磨到 2 万"},
            {"label": "成本纪律", "value": "很强", "hint": "守 1 年不冲动"},
            {"label": "品类匹配", "value": "待验证", "hint": "需对齐点位客流"},
        ],
        "narrative": {"title": "会砍成本的高手，也要验证需求",
                      "body": "这位老板为了选址守了整整一年,把 8 万转让费磨到 2 万,是个懂得等待和算账的高手。低成本接铺让他起点很稳。开业前唯一要补的,是把要卖的品类和这个点位的真实客流对齐,别把好铺浪费在错品类上。"},
        "signals": [
            {"label": "转让费", "value": "从 8 万谈到 2 万", "status": "confirmed"},
            {"label": "决策纪律", "value": "守 1 年不冲动入场", "status": "confirmed"},
            {"label": "经营品类", "value": "尚未最终锁定", "status": "provisional"},
        ],
        "plans": [
            {"role": "主方案", "bottleneck": "品类与点位匹配",
             "title": "开业前 5 天试卖锁定主打", "action": "用低成本方式在该点位试卖 2–3 个候选品类,记录转化与复问,选出主打再正式开业。",
             "budgetCap": 800, "durationDays": 5, "metric": "候选品类转化率",
             "successLine": "选出一个转化明显更好的主打品类。", "stopLine": "都无明显转化就重估选品。"},
            {"role": "备选方案", "bottleneck": "开业冷启动",
             "title": "开业首周做保守促销测试", "action": "首周用小额引流品测试到店转化,不做大额补贴。",
             "budgetCap": 500, "durationDays": 7, "metric": "首周到店与复购",
             "successLine": "首周到店与复购达到预期。", "stopLine": "转化差就调整产品与定价。"},
        ],
        "rejected": ["主打品类未验证前，不一次备足全线物料。",
                     "低价接铺的优势不该用高额营销抵消。"],
        "evidence": 76, "rank": 53, "date": "2026-07-22T14:00:00.000Z",
    },
    # ---- 停止追加 (STOP) ----
    {
        "id": "public-seed-noodle", "bvid": "BV1dYijBhEt6",
        "location": "河北 · 石家庄", "category": "加盟面馆", "stage": "operating",
        "decision": "STOP", "conclusion": "停止追加",
        "status": "日亏约 600 元，加盟与平台扣点侵蚀利润",
        "title": "先把固定支出砍下来，别再加投入",
        "reason": "人工、房租、水电叠加下日亏约 600 元,加盟和平台扣点进一步压缩空间。现在最该做的是止住失血——砍固定支出、书面确认扣点,而不是继续投钱做营销。",
        "metrics": [
            {"label": "日亏损", "value": "约 ¥600", "hint": "固定支出偏高"},
            {"label": "月固定支出", "value": "约 ¥39,300", "hint": "人工+房租+水电"},
            {"label": "现金寿命", "value": "持续消耗", "hint": "需尽快止损"},
        ],
        "narrative": {"title": "先止血，再谈要不要留",
                      "body": "这家加盟面馆日亏约 600 元,问题主要在固定支出结构和加盟/平台扣点。别再往里投营销费——先把人工和扣点这两块砍下来,给自己留出判断'留还是走'的现金窗口。"},
        "signals": [
            {"label": "人员", "value": "4 人", "status": "confirmed"},
            {"label": "渠道", "value": "堂食加外卖，外卖由品牌方统一运营", "status": "confirmed"},
        ],
        "plans": [
            {"role": "主方案", "bottleneck": "固定支出过高",
             "title": "固定支出一刀切", "action": "人工 2.4 万、房租约 1.08 万、水电约 4500,日亏约 600 元。砍掉一名厨师改为标准出餐,品牌方与平台扣点要求书面确认。",
             "budgetCap": 0, "durationDays": 30, "metric": "日固定支出",
             "successLine": "30 天内日固定支出降到 1100 元以下,且日出餐稳定在 120 单以上。", "stopLine": "品牌方不配合或单量继续下滑,闭店转让。"},
            {"role": "备选方案", "bottleneck": "沉没成本回收",
             "title": "打包转让回收残值", "action": "设备与剩余租约打包转让,加盟权按合同条款协商退出。",
             "budgetCap": 0, "durationDays": 45, "metric": "转让回收金额",
             "successLine": "45 天内完成转让,回收不低于 8 万。", "stopLine": "无人接盘,租约到期不再续租。"},
        ],
        "rejected": ["单位经济未修复前，不投任何拉新营销。",
                     "扣点条款未书面确认，不续加盟合同。"],
        "evidence": 85, "rank": 59, "date": "2026-07-20T09:00:00.000Z",
    },
    {
        "id": "public-seed-fried-meat", "bvid": "BV1R4546zE8v",
        "location": "湖南 · 长沙", "category": "炸鸡杂肉（商场一层）", "stage": "operating",
        "decision": "STOP", "conclusion": "停止追加",
        "status": "月营收约 4 万，仅房租就 2 万，单位经济不成立",
        "title": "启动退出谈判，别再补设备与推广",
        "reason": "月营收约 4 万而房租就占 2 万,单位经济根本不成立。继续投设备和推广只会加大亏损。应转向退出谈判,尽量回收押金和残值。",
        "metrics": [
            {"label": "月营业额", "value": "约 ¥40,000", "hint": "商场一层堂食"},
            {"label": "月房租", "value": "约 ¥20,000", "hint": "占营收一半"},
            {"label": "单位经济", "value": "不成立", "hint": "结构性亏损"},
        ],
        "narrative": {"title": "结构性亏损，先谈退出",
                      "body": "商场一层这家炸鸡杂肉,月营收 4 万但光房租就 2 万,单位经济不成立。这不是靠努力能补的窟窿,应尽快启动转让或退租谈判,把押金和残值尽量收回来。"},
        "signals": [
            {"label": "人员", "value": "3 人", "status": "confirmed"},
            {"label": "渠道", "value": "商场一层堂食", "status": "confirmed"},
            {"label": "变动成本率", "value": "约 50%", "status": "provisional"},
        ],
        "plans": [
            {"role": "主方案", "bottleneck": "房租占比过高",
             "title": "停止追加，启动退出谈判", "action": "月营收约 4 万、仅房租就 2 万,单位经济不成立。不再补设备与推广,与出让方协商转让或退租,盘点可回收押金。",
             "budgetCap": 0, "durationDays": 30, "metric": "押金与转让回收",
             "successLine": "30 天内谈成转让或退租,押金回收不低于三成。", "stopLine": "再亏满 1 个月仍未谈成,直接闭店止损。"},
            {"role": "备选方案", "bottleneck": "固定成本刚性",
             "title": "若坚持经营先压缩人工", "action": "三人压缩为两人,砍掉低峰时段营业,目标月固定支出降到 2.4 万以内。",
             "budgetCap": 0, "durationDays": 28, "metric": "月固定支出",
             "successLine": "连续 4 周毛利覆盖固定支出。", "stopLine": "任意两周不覆盖,立即执行退出。"},
        ],
        "rejected": ["房租结构不改，不投设备与推广。",
                     "单位经济不成立，不追加任何拉新预算。"],
        "evidence": 82, "rank": 57, "date": "2026-07-21T09:00:00.000Z",
    },
    {
        "id": "public-seed-fried-chicken", "bvid": "BV1GnfqB6Eq7",
        "location": "湖北 · 武汉", "category": "大学城炸鸡店", "stage": "operating",
        "decision": "STOP", "conclusion": "停止追加",
        "status": "毛利不足两成，70 平大店堂食利用率低",
        "title": "先修复毛利，修不好就缩面积或退出",
        "reason": "外卖占六成但毛利不足两成,大店堂食又利用不起来。先集中修复毛利,同时评估把大店换小,别在亏损结构上继续追加。",
        "metrics": [
            {"label": "实测毛利", "value": "不足 20%", "hint": "需拉到 35% 以上"},
            {"label": "堂食利用", "value": "偏低", "hint": "70 平面积浪费"},
            {"label": "渠道", "value": "外卖约六成", "hint": "堂食约四成"},
        ],
        "narrative": {"title": "毛利是命门，先修它",
                      "body": "大学城这家炸鸡店外卖占六成,但毛利不足两成,70 平的堂食又用不满。当务之急是重算定价、下架亏损单品把毛利拉起来;如果修不动,就把大店换小,别在错误结构上继续投钱。"},
        "signals": [
            {"label": "渠道", "value": "外卖约六成，堂食约四成", "status": "confirmed"},
            {"label": "变动成本率", "value": "约 80%", "status": "provisional"},
            {"label": "人员", "value": "4 人", "status": "confirmed"},
        ],
        "plans": [
            {"role": "主方案", "bottleneck": "毛利过低",
             "title": "先修复毛利再谈单量", "action": "重算定价与外卖打包费,目标毛利从不足两成拉到 35% 以上;下架亏损单品,3 款高毛利套餐测试 7 天。",
             "budgetCap": 300, "durationDays": 7, "metric": "实测毛利率",
             "successLine": "7 天实测毛利不低于 35%,且单量不低于现状八成。", "stopLine": "毛利无法提到 25% 以上,停止追加,准备转让。"},
            {"role": "备选方案", "bottleneck": "面积成本浪费",
             "title": "大店换小，砍掉堂食面积", "action": "70 平炸鸡店堂食占比低,评估分租或搬入小店,目标租金减半。",
             "budgetCap": 0, "durationDays": 30, "metric": "月固定支出",
             "successLine": "月固定支出下降不低于四成。", "stopLine": "一个月内无法落地,按主方案退出节奏执行。"},
        ],
        "rejected": ["毛利未修复前，不做满减促销冲单量。",
                     "堂食利用率低，不为大店追加装修。"],
        "evidence": 80, "rank": 56, "date": "2026-07-22T09:00:00.000Z",
    },
    {
        "id": "public-seed-tofu-soup", "bvid": "BV1Ga5S6vES8",
        "location": "辽宁 · 沈阳", "category": "养生豆腐汤", "stage": "operating",
        "decision": "STOP", "conclusion": "停止追加",
        "status": "投入 20 万但每天仅赚约 95 元，却想开分店",
        "title": "第一家都没跑通，坚决不开第二家",
        "reason": "20 万投入换来每天约 95 元的利润,单店模型还远没跑通,这时候开分店等于把一个未验证的亏损模型复制两遍。先把单店做到健康,再谈复制。",
        "metrics": [
            {"label": "日净利", "value": "约 ¥95", "hint": "相对 20 万投入极低"},
            {"label": "初始投入", "value": "约 ¥200,000", "hint": "回本遥遥"},
            {"label": "扩张冲动", "value": "想开分店", "hint": "模型未验证"},
        ],
        "narrative": {"title": "别把没跑通的模型复制两遍",
                      "body": "养生豆腐汤投了 20 万,每天却只赚 95 元,单店模型显然没跑通。老板却想开分店——这是最危险的信号。正确的顺序是先把第一家做到日净利健康,证明模型成立,再谈第二家。"},
        "signals": [
            {"label": "日净利", "value": "约 95 元", "status": "confirmed"},
            {"label": "初始投入", "value": "约 20 万", "status": "confirmed"},
            {"label": "单店模型", "value": "尚未验证成立", "status": "provisional"},
        ],
        "plans": [
            {"role": "主方案", "bottleneck": "单店模型未跑通",
             "title": "30 天先把单店日净利拉起来", "action": "聚焦一家店,拆解客单、单量、毛利与固定成本,找出日净利只有 95 的主因并做单点改善。",
             "budgetCap": 500, "durationDays": 30, "metric": "单店日净利",
             "successLine": "单店日净利稳定提升到可接受水平。", "stopLine": "30 天无改善,考虑转让或退出,绝不开分店。"},
            {"role": "备选方案", "bottleneck": "品类需求偏窄",
             "title": "验证养生定位的真实复购", "action": "用 3 周记录复购客占比,判断养生定位是拉客还是限客。",
             "budgetCap": 0, "durationDays": 21, "metric": "复购客占比",
             "successLine": "复购稳定支撑单店经营。", "stopLine": "复购持续偏低就重估定位。"},
        ],
        "rejected": ["单店模型未验证，坚决不开第二家。",
                     "日净利极低时，不追加装修或设备。"],
        "evidence": 77, "rank": 54, "date": "2026-07-21T15:00:00.000Z",
    },
    # ---- 准备退出 (EXIT) ----
    {
        "id": "public-seed-coffee", "bvid": "BV1nXz7BEENF",
        "location": "广东 · 东莞", "category": "加盟咖啡店", "stage": "operating",
        "decision": "EXIT", "conclusion": "准备退出",
        "status": "日销不足 200 元，疑似加盟快招误导",
        "title": "启动退出与维权，停止一切新增投入",
        "reason": "日销不足 200 元,叠加疑似加盟快招误导,继续经营只会扩大损失。应立即停止投入,收集证据推进维权,并同步挂出转让。",
        "metrics": [
            {"label": "日营业额", "value": "不足 ¥200", "hint": "远低于保本"},
            {"label": "加盟性质", "value": "疑似快招", "hint": "需固定证据"},
            {"label": "止损优先级", "value": "最高", "hint": "停止新增投入"},
        ],
        "narrative": {"title": "先止损维权，别再囤货",
                      "body": "这家加盟咖啡日销不足 200 元,还疑似遭遇加盟快招误导。此刻任何新增投入(包括物料囤货)都是在放大损失。正确动作是固定证据、咨询律师主张欺诈,同时挂出转让,尽量回收。"},
        "signals": [
            {"label": "日单量", "value": "约 15 单", "status": "provisional"},
            {"label": "渠道", "value": "堂食", "status": "confirmed"},
        ],
        "plans": [
            {"role": "主方案", "bottleneck": "疑似加盟欺诈",
             "title": "启动退出与维权", "action": "日销不足 200 元且加盟疑似快招误导。收集办证提醒记录、合同与转账凭证,咨询律师主张加盟欺诈,同步挂出转让。",
             "budgetCap": 0, "durationDays": 60, "metric": "回收金额",
             "successLine": "60 天内完成转让或解约,回收部分加盟费与转让费。", "stopLine": "不再有任何新增投入,包括物料囤货。"},
            {"role": "备选方案", "bottleneck": "验证是否还有一线生机",
             "title": "极限压缩验证 30 天", "action": "一人守店、砍掉全部付费推广,只做周边社群团购预定,验证日销能否到 800 元。",
             "budgetCap": 0, "durationDays": 30, "metric": "日营业额",
             "successLine": "连续两周日销不低于 800 元。", "stopLine": "达不到立即退出。"},
        ],
        "rejected": ["日销远低于保本，不追加任何物料或推广。",
                     "证据未固定前，不与加盟方私下和解让步。"],
        "evidence": 75, "rank": 51, "date": "2026-07-23T12:00:00.000Z",
    },
    {
        "id": "public-seed-milktea", "bvid": "BV11BM76UEBG",
        "location": "河南 · 郑州", "category": "杂牌加盟奶茶", "stage": "operating",
        "decision": "EXIT", "conclusion": "准备退出",
        "status": "18 万加盟杂牌，开业一个月即难以为继",
        "title": "尽快止损退出，追讨加盟责任",
        "reason": "18 万加盟一个杂牌奶茶,开业一个月就撑不住,说明品牌无势能、选品和供应链都不成立。继续投入没有意义,应尽快止损并追讨加盟方责任。",
        "metrics": [
            {"label": "加盟投入", "value": "约 ¥180,000", "hint": "杂牌无品牌势能"},
            {"label": "存活时间", "value": "约 1 个月", "hint": "开业即难以为继"},
            {"label": "止损优先级", "value": "最高", "hint": "立即退出"},
        ],
        "narrative": {"title": "杂牌加盟的钱，越早止损越好",
                      "body": "花 18 万加盟一个没听过的杂牌奶茶,开业一个月就快完蛋。这类项目往往是品牌无势能、供应链和选品都靠不住。别再幻想月入过万,尽快挂转让、追讨加盟方责任,把能收回的收回来。"},
        "signals": [
            {"label": "品牌势能", "value": "杂牌，无自然客流", "status": "confirmed"},
            {"label": "存活时长", "value": "约 1 个月即难支撑", "status": "confirmed"},
            {"label": "加盟支持", "value": "供应与选品薄弱", "status": "provisional"},
        ],
        "plans": [
            {"role": "主方案", "bottleneck": "品牌与加盟结构失败",
             "title": "立即挂转让并追讨加盟责任", "action": "停止一切新增投入,固定加盟合同与宣传承诺证据,挂出设备转让,咨询加盟方虚假宣传的追责路径。",
             "budgetCap": 0, "durationDays": 45, "metric": "回收金额",
             "successLine": "45 天内完成设备转让并主张部分加盟退款。", "stopLine": "无论如何不再向该项目追加投入。"},
            {"role": "备选方案", "bottleneck": "设备残值回收",
             "title": "设备打包出二手回收残值", "action": "把制冰机、封口机等设备打包在二手平台出售,回收现金。",
             "budgetCap": 0, "durationDays": 30, "metric": "设备回收金额",
             "successLine": "设备残值回收达到预期。", "stopLine": "无人接手就逐件出售,不硬扛经营。"},
        ],
        "rejected": ["品牌无势能，不投任何拉新或装修。",
                     "加盟方承诺未兑现，不续缴任何费用。"],
        "evidence": 71, "rank": 47, "date": "2026-07-20T15:00:00.000Z",
    },
]


def build_snapshot(case: dict) -> dict:
    return {
        "stage": case["stage"],
        "category": case["category"],
        "location": case["location"],
        "decision": case["decision"],
        "conclusion": case["conclusion"],
        "statusLine": case["status"],
        "decisionTitle": case["title"],
        "decisionReason": case["reason"],
        "metrics": case["metrics"],
        "narrative": case["narrative"],
        "signals": case["signals"],
        "plans": case["plans"],
        "rejectedReasons": case["rejected"],
        "evidenceScore": case["evidence"],
    }


def sql_escape(text: str) -> str:
    return text.replace("'", "''")


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "-- Generated by seed_public_cases.py. Do not edit by hand.",
        "-- Refreshes the Shop Ranking List with diverse, display-ready snapshots.",
        "DELETE FROM public_case_outcomes WHERE public_case_id LIKE 'public-seed-%';",
        "DELETE FROM public_cases WHERE id LIKE 'public-seed-%';",
    ]
    for case in CASES:
        snapshot = build_snapshot(case)
        snapshot_json = sql_escape(json.dumps(snapshot, ensure_ascii=False))
        source_case_id = f"subtitle-{case['bvid']}"
        data_score = case["evidence"]
        rank_score = case["rank"]
        row = (
            "INSERT INTO public_cases (id, source_case_id, manage_token_hash, snapshot_json, "
            "data_score, outcome_score, rank_score, is_active, created_at, updated_at) VALUES ("
            f"'{case['id']}', '{source_case_id}', '{token_hash(case['id'])}', "
            f"'{snapshot_json}', {data_score}, 0, {rank_score}, 1, "
            f"'{case['date']}', '{case['date']}');"
        )
        lines.append(row)
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {len(CASES)} cases to {OUT}")


if __name__ == "__main__":
    main()
