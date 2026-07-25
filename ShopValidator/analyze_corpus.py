#!/usr/bin/env python3
"""Audit and analyze the 勇哥餐饮 subtitle archive.

The source subtitles are machine-generated and, in this archive, sometimes
duplicated or attached to the wrong video.  This script deliberately optimizes
for precision rather than recall: questionable transcripts are excluded from
content statistics but remain visible in the quality report.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import statistics
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


TIME_RE = re.compile(
    r"(?P<h>\d{2}):(?P<m>\d{2}):(?P<s>\d{2})[,.](?P<ms>\d{3})"
)


def count_terms(text: str, terms: Iterable[str]) -> int:
    return sum(text.count(term) for term in terms)


RESTAURANT_TERMS = (
    "餐饮", "餐厅", "饭店", "店里", "门店", "开店", "老板", "营业额", "生意",
    "房租", "租金", "转让费", "加盟", "毛利", "人工", "员工", "水电", "物业",
    "客单", "顾客", "消费者", "客流", "人流", "进店", "翻台", "外卖", "团购",
    "菜单", "菜品", "产品", "招牌", "门头", "商圈", "选址", "位置", "亏损",
    "赔钱", "投资", "回本", "利润", "成本", "每天卖", "一个月", "平方米", "平米",
    "咖啡", "奶茶", "火锅", "烧烤", "烤肉", "面馆", "餐馆", "小吃", "酒馆",
)

FINANCIAL_TERMS = (
    "营业额", "毛利", "利润", "亏损", "赔钱", "房租", "租金", "人工", "工资",
    "水电", "物业", "成本", "投资", "转让费", "加盟费", "回本", "客单", "流水",
)

UNRELATED_TERMS = (
    "漫威", "宇宙大爆炸", "黑洞", "银河系", "奥特曼", "怪兽", "显卡", "游戏角色",
    "副本", "电竞", "航天器", "足球比赛", "英超", "欧冠", "量子力学",
)

META_TITLE_TERMS = (
    "回应", "说错话", "执法记录仪", "填写志愿", "背刺", "爆笑吃瓜", "声明",
)

PRODUCT_TERMS = (
    "咖啡", "奶茶", "火锅", "烧烤", "烤肉", "面包", "面馆", "粉店", "米粉", "螺蛳粉",
    "烤鱼", "炒饭", "快餐", "茶餐厅", "酒馆", "甜品", "蛋糕", "披萨", "汉堡", "自助餐",
    "川菜", "湘菜", "福州菜", "牛肉", "羊肉", "鸡", "鸭", "面", "鱼", "餐厅", "饭店",
)

PROBLEM_PATTERNS = {
    "亏损与现金流": ("亏", "赔", "倒闭", "关店", "扛不住", "清零", "负债", "抵押", "没了"),
    "选址与客流": ("位置", "选址", "人流", "客流", "没人", "鸟不拉屎", "看不到", "商场"),
    "加盟与品牌": ("加盟", "总部", "品牌", "招商", "套路", "割韭菜"),
    "投入过重": ("砸", "投资", "投入", "转让费", "装修", "重金", "万开"),
    "产品与定价": ("定价", "成本", "卖", "产品", "预制", "菜单", "价格", "难吃"),
    "运营与人员": ("厨师", "员工", "合伙", "差评", "服务", "运营", "管理"),
    "增长诉求": ("营业额", "翻倍", "月赚", "月入", "发财", "救活", "提升"),
}

TITLE_STAGE_PATTERNS = {
    "经营困境/止损": ("亏", "赔", "倒闭", "关店", "扛不住", "清零", "没人买", "生意不好", "下滑", "难救"),
    "开店前/投入决策": ("想开", "准备开", "选址", "转让费", "准备加盟", "要开", "还没开"),
    "增长/成功复盘": ("月赚", "月入", "翻倍", "发财", "神店", "回本", "成功", "更上一层楼"),
}

DIMENSIONS = {
    "当前营业额": ("营业额", "流水", "一天卖", "每天卖", "一天能卖", "一个月卖"),
    "毛利与变动成本": ("毛利", "食材成本", "原料成本", "成本率", "平台扣点"),
    "房租物业与合同": ("房租", "租金", "物业", "押金", "租期", "合同", "转让费"),
    "人工与老板在场": ("人工", "工资", "员工", "几个人", "社保", "老板在", "自己干"),
    "水电及其他固定成本": ("水电", "电费", "燃气", "宿舍", "仓库", "推广费"),
    "初始投入与债务": ("投资", "投入", "砸了", "借钱", "贷款", "抵押", "负债"),
    "位置商圈与客流": ("位置", "商圈", "人流", "客流", "地铁", "景区", "小区", "学校", "写字楼"),
    "门头与可见性": ("门头", "招牌", "看不到", "展示", "门口", "入口", "楼上", "二楼"),
    "产品客单与差异化": ("产品", "菜品", "菜单", "客单", "定价", "价格", "特色", "招牌菜"),
    "渠道口碑与转化": ("外卖", "团购", "抖音", "小红书", "点评", "差评", "进店", "转化"),
    "加盟与经营者风险": ("加盟", "总部", "加盟费", "老板", "以前做", "经验", "合伙"),
    "纠偏退出与机会成本": ("止损", "关掉", "转让", "别做", "改成", "缩小", "回本", "机会成本"),
}

STATED_REQUEST_PATTERNS = {
    "提升营业额/单量": (
        r"提升.{0,8}营业额", r"单量.{0,8}(?:低|少)", r"生意.{0,6}(?:不好|太差)",
        r"营业额.{0,6}(?:下滑|下降)", r"没人买", r"没有生意",
    ),
    "请人诊断/优化": (
        r"帮我.{0,12}(?:分析|看一下|看看)", r"想让你.{0,12}(?:分析|看看)",
        r"优化一下", r"分析一下思路", r"怎么搞", r"做的对不对",
    ),
    "开店/选址/签约前判断": (
        r"帮我选址", r"位置.{0,8}(?:合不合适|行不行)", r"还没(?:开始|开业)",
        r"准备.{0,8}(?:开|做)", r"想开.{0,8}店", r"预计.{0,8}开业",
    ),
    "亏损/是否止损": (
        r"(?:每天|每月|一个月).{0,8}亏", r"亏本", r"扛不住", r"要不要关",
        r"关店", r"转出去", r"止损",
    ),
    "加盟/接店/转让判断": (
        r"想.{0,10}加盟", r"加盟.{0,12}(?:怎么样|能不能|值不值)", r"咨询.{0,8}品牌",
        r"想.{0,8}(?:接盘|接店)", r"要不要.{0,8}(?:接盘|接店)",
        r"想.{0,8}(?:转出去|转让)", r"转让费.{0,8}(?:值不值|高不高)",
    ),
    "产品/价格/菜单调整": (
        r"产品.{0,8}(?:单一|调整|问题)", r"菜单.{0,8}(?:调整|怎么|问题)",
        r"定价.{0,8}(?:怎么|问题|合不合理)", r"价格.{0,8}(?:高|低|怎么)",
        r"想.{0,8}改.{0,8}产品",
    ),
    "产能/人员/运营": (
        r"接不住", r"出品", r"厨师", r"员工.{0,8}(?:问题|管理)", r"运营.{0,8}问题",
    ),
}

DIAGNOSED_RISK_PATTERNS = {
    "单位经济与现金流不成立": (
        r"每天.{0,8}亏", r"一个月.{0,8}亏", r"毛利.{0,12}(?:房租|人工)",
        r"保本", r"入不敷出", r"现金流", r"扛不住",
    ),
    "不可逆投入/沉没成本过高": (
        r"投了.{0,8}万", r"投资.{0,8}万", r"装修", r"转让费", r"加盟费",
        r"抵押", r"借钱", r"贷款", r"沉没成本",
    ),
    "目标客流/可见/转化断裂": (
        r"人流不叫有客流", r"转化率", r"看不到", r"门头", r"招牌",
        r"没人买", r"卖给谁", r"谁会到你",
    ),
    "产品价值/定价/毛利错误": (
        r"你是卖啥", r"卖什么", r"产品.{0,8}(?:单一|差|问题)", r"难吃",
        r"定价", r"价格", r"成本.{0,8}卖",
    ),
    "加盟/接盘/合同风险": (
        r"加盟", r"总部", r"招商", r"接盘", r"转让", r"合同", r"租期",
    ),
    "人工/产能/交付问题": (
        r"人工", r"几个人在店", r"员工", r"厨师", r"接不住", r"出品",
    ),
    "经营者经验/机会成本": (
        r"以前开过店", r"第一次做", r"开之前认识", r"机会成本",
        r"回去上班", r"工资", r"青春",
    ),
}

# These are deliberately phrased as concrete questions/actions rather than
# broad topics.  Presence and first occurrence are used to reconstruct the
# recurring diagnostic protocol without requiring unreliable speaker labels.
QUESTION_PROTOCOL_PATTERNS = {
    "先看店外与门头": (
        r"对着你的店", r"走出去", r"走到门口", r"往后退", r"招牌在哪", r"门头",
    ),
    "确认城市与商圈": (
        r"哪个城市", r"在哪个城市", r"市区县城乡镇", r"市区还是县城",
    ),
    "确认品类与核心产品": (
        r"开的什么店", r"做什么店", r"你是卖啥", r"卖的是什么", r"做.{0,6}的是吧",
    ),
    "问当前营业额": (
        r"一天卖多少钱", r"一个月.{0,8}营业额", r"上个月.{0,8}营业额",
        r"每天卖多少钱", r"一天能卖",
    ),
    "问毛利与变动成本": (
        r"毛利率多少", r"毛利有多少", r"综合毛利", r"食材成本", r"平台扣点",
    ),
    "问面积与房租": (
        r"多大面积", r"多少平", r"房租多少钱", r"租金多少钱", r"物业",
    ),
    "问租约与一次性费用": (
        r"怎么付", r"押.{0,2}付.{0,2}", r"有没有押金", r"转让费",
        r"入场费", r"中介费", r"喝茶费",
    ),
    "问人员与老板劳动": (
        r"几个人在店", r"几个人在天上", r"人工多少钱", r"工资多少",
        r"你在不在店", r"为什么不算你",
    ),
    "问水电与其他固定支出": (
        r"水电气多少钱", r"水电.{0,4}多少", r"燃气", r"推广费",
    ),
    "问初始投入与债务": (
        r"投了多少钱", r"投资多少钱", r"店投入多少钱", r"借钱", r"贷款", r"抵押",
    ),
    "问经营时长与历史": (
        r"开多久", r"开了多久", r"开之前认识", r"以前开过店", r"第一次做",
    ),
    "拆分堂食/外卖/渠道": (
        r"多少外卖多少.{0,4}食", r"外卖.{0,8}堂食", r"团购", r"私域",
    ),
    "追问客户与消费理由": (
        r"卖给谁", r"谁会到你", r"消费者.{0,12}什么", r"顾客.{0,8}是谁",
        r"为什么.{0,8}选你", r"复购",
    ),
    "比较退出与机会成本": (
        r"关掉", r"转让", r"止损", r"回去上班", r"机会成本", r"工资.{0,8}一个月",
    ),
}

REQUEST_MARKERS = (
    "遇到什么问题", "有什么问题", "问题呢", "想问一下", "想要让你", "想让你",
)


@dataclass
class SrtDoc:
    bvid: str
    title: str
    declared_duration_s: int
    path: Path
    raw: str
    text: str
    caption_count: int
    last_timestamp_s: float
    sha256: str


def parse_duration(value: str) -> int:
    parts = [int(p) for p in value.split(":")]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return 0


def timestamp_seconds(match: re.Match[str]) -> float:
    return (
        int(match.group("h")) * 3600
        + int(match.group("m")) * 60
        + int(match.group("s"))
        + int(match.group("ms")) / 1000
    )


def parse_srt(path: Path, meta: dict) -> SrtDoc:
    raw = path.read_text(encoding="utf-8", errors="replace")
    lines = []
    timestamps = []
    caption_count = 0
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.isdigit():
            continue
        if "-->" in line:
            found = list(TIME_RE.finditer(line))
            if found:
                timestamps.extend(timestamp_seconds(m) for m in found)
                caption_count += 1
            continue
        lines.append(line)
    text = re.sub(r"\s+", "", "".join(lines))
    return SrtDoc(
        bvid=meta["bvid"],
        title=meta.get("title", ""),
        declared_duration_s=parse_duration(meta.get("duration", "0:00")),
        path=path,
        raw=raw,
        text=text,
        caption_count=caption_count,
        last_timestamp_s=max(timestamps, default=0.0),
        sha256=hashlib.sha256(raw.encode("utf-8", errors="replace")).hexdigest(),
    )


def title_alignment(doc: SrtDoc) -> tuple[int, list[str]]:
    title_products = [term for term in PRODUCT_TERMS if term in doc.title]
    matched = [term for term in title_products if term in doc.text]
    if not title_products:
        return (1 if count_terms(doc.text, FINANCIAL_TERMS) >= 6 else 0), matched
    return len(matched), matched


def audit_doc(doc: SrtDoc, duplicate_choice: str | None) -> dict:
    restaurant_signal = count_terms(doc.text, RESTAURANT_TERMS)
    financial_signal = count_terms(doc.text, FINANCIAL_TERMS)
    unrelated_signal = count_terms(doc.text, UNRELATED_TERMS)
    alignment, aligned_terms = title_alignment(doc)
    coverage = (
        doc.last_timestamp_s / doc.declared_duration_s
        if doc.declared_duration_s
        else 0.0
    )
    present_dimensions = [
        label for label, terms in DIMENSIONS.items() if any(term in doc.text for term in terms)
    ]
    reasons: list[str] = []

    if doc.caption_count < 80:
        reasons.append("字幕条目过少")
    if restaurant_signal < 40:
        reasons.append("餐饮语义信号不足")
    if financial_signal < 5:
        reasons.append("经营/财务语义信号不足")
    if len(present_dimensions) < 4:
        reasons.append("可识别判断维度不足")
    if unrelated_signal >= 4 and unrelated_signal > restaurant_signal / 8:
        reasons.append("出现明显无关主题")
    title_has_product = any(term in doc.title for term in PRODUCT_TERMS)
    if title_has_product and alignment == 0:
        reasons.append("标题品类与正文不匹配")
    if coverage < 0.18:
        reasons.append("字幕覆盖严重不足")
    if duplicate_choice and duplicate_choice != doc.bvid:
        reasons.append("与其他视频字幕重复且非最佳匹配")

    accepted = not reasons
    return {
        "bvid": doc.bvid,
        "title": doc.title,
        "path": str(doc.path),
        "accepted": accepted,
        "exclusion_reasons": reasons,
        "caption_count": doc.caption_count,
        "declared_duration_s": doc.declared_duration_s,
        "last_timestamp_s": round(doc.last_timestamp_s, 3),
        "coverage_ratio": round(coverage, 3),
        "restaurant_signal": restaurant_signal,
        "financial_signal": financial_signal,
        "unrelated_signal": unrelated_signal,
        "title_body_alignment": alignment,
        "aligned_terms": aligned_terms,
        "dimensions": present_dimensions,
        "sha256": doc.sha256,
    }


def classify_title(title: str) -> tuple[str, list[str]]:
    stage = "其他案例/内容"
    for label, patterns in TITLE_STAGE_PATTERNS.items():
        if any(p in title for p in patterns):
            stage = label
            break
    if any(term in title for term in META_TITLE_TERMS) and stage == "其他案例/内容":
        stage = "争议/花絮/非诊断"
    problems = [
        label for label, patterns in PROBLEM_PATTERNS.items() if any(p in title for p in patterns)
    ]
    return stage, problems


def matches_any(text: str, patterns: Iterable[str]) -> bool:
    return any(re.search(pattern, text) for pattern in patterns)


def request_window(text: str, max_chars: int = 2600) -> str:
    """Keep the opening diagnostic exchange, where the caller states the ask."""
    return text[:max_chars]


def request_snippet(text: str, max_chars: int = 260) -> str:
    opening = request_window(text)
    positions = [opening.find(marker) for marker in REQUEST_MARKERS]
    positions = [position for position in positions if position >= 0]
    start = min(positions) if positions else 0
    return opening[start:start + max_chars]


def classify_conversation(doc: SrtDoc) -> dict:
    stated_text = request_snippet(doc.text, max_chars=420)
    combined = f"{doc.title}{doc.text}"
    stated_requests = [
        label
        for label, patterns in STATED_REQUEST_PATTERNS.items()
        if matches_any(stated_text, patterns)
    ]
    diagnosed_risks = [
        label
        for label, patterns in DIAGNOSED_RISK_PATTERNS.items()
        if matches_any(combined, patterns)
    ]

    question_positions: dict[str, int] = {}
    for label, patterns in QUESTION_PROTOCOL_PATTERNS.items():
        positions = []
        for pattern in patterns:
            match = re.search(pattern, doc.text)
            if match:
                positions.append(match.start())
        if positions:
            question_positions[label] = min(positions)

    return {
        "bvid": doc.bvid,
        "title": doc.title,
        "stated_requests": stated_requests,
        "diagnosed_risks": diagnosed_risks,
        "request_snippet": stated_text,
        "question_positions": question_positions,
        "text_length": len(doc.text),
    }


def latest_manifest(path: Path) -> dict[str, dict]:
    latest: dict[str, dict] = {}
    with path.open(encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, 1):
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"manifest 第 {line_no} 行不是有效 JSON") from exc
            latest[row["bvid"]] = row
    return latest


def pct(count: int, total: int) -> float:
    return round(100 * count / total, 1) if total else 0.0


def replace_generated_block(document: str, name: str, content: str) -> str:
    start = f"<!-- GENERATED:{name}:START -->"
    end = f"<!-- GENERATED:{name}:END -->"
    if start not in document or end not in document:
        return document
    pattern = re.compile(re.escape(start) + r".*?" + re.escape(end), re.S)
    replacement = f"{start}\n{content.rstrip()}\n{end}"
    return pattern.sub(lambda _: replacement, document, count=1)


def refresh_research_markdown(report: dict, path: Path) -> None:
    if not path.exists():
        return
    archive = report["archive"]
    progress_note = (
        "全量归档已经完成。"
        if archive["collection_complete"]
        else (
            f"全量归档仍在后台进行：当前 {archive['manifest_unique_videos']}/"
            f"{archive['expected_total_at_collection_start']}（{archive['collection_progress_pct']}%）。"
        )
    )
    summary = (
        progress_note
        + f"本轮已归档 {archive['manifest_unique_videos']} 个独立视频条目，其中 "
        f"{archive['saved_status']} 个有字幕文件。字幕经过去重、标题—正文匹配、餐饮经营语义、"
        f"字幕长度、覆盖率和无关主题检查后，只保留 {archive['accepted_transcripts']} 份，"
        f"剔除 {archive['excluded_transcripts']} 份。保留率为 {archive['acceptance_rate_pct']}%。"
        "这不是缺陷，而是有意的高精度策略：宁可少用，也不让错配的 AI 字幕污染结论。"
    )
    title_rows = [
        "|问题|标题数|占全部标题|",
        "|---|---:|---:|",
        *[
            f"|{row['label']}|{row['count']}|{row['pct']}%|"
            for row in report["title_problem_distribution"]
        ],
    ]
    dimension_rows = [
        f"{archive['accepted_transcripts']} 份高可信字幕的文档频率如下。"
        "它表示某类信息在多少份字幕中明确出现，不表示勇哥每次都以完全相同顺序发问。",
        "",
        "|判断维度|出现率|",
        "|---|---:|",
        *[
            f"|{row['label']}|{row['pct']}%|"
            for row in report["verified_judgment_dimensions"]
        ],
    ]
    document = path.read_text(encoding="utf-8")
    document = replace_generated_block(document, "CORPUS_SUMMARY", summary)
    document = replace_generated_block(document, "TITLE_PROBLEMS", "\n".join(title_rows))
    document = replace_generated_block(document, "JUDGMENT_DIMENSIONS", "\n".join(dimension_rows))
    path.write_text(document, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    here = Path(__file__).resolve().parent
    parser.add_argument(
        "--archive",
        type=Path,
        default=here.parent / "bilibili-ai-subtitles",
        help="包含 manifest.jsonl 和 srt/ 的字幕归档目录",
    )
    parser.add_argument("--output", type=Path, default=here / "data")
    parser.add_argument(
        "--expected-total",
        type=int,
        default=623,
        help="开始归档时账号的视频总数；用于明确标记统计是否已完整",
    )
    args = parser.parse_args()

    manifest_path = args.archive / "manifest.jsonl"
    srt_dir = args.archive / "srt"
    records = latest_manifest(manifest_path)
    docs: list[SrtDoc] = []
    missing_files: list[str] = []
    for bvid, meta in records.items():
        if meta.get("status") != "saved":
            continue
        path = srt_dir / f"{bvid}.srt"
        if not path.exists():
            missing_files.append(bvid)
            continue
        docs.append(parse_srt(path, meta))

    hash_groups: dict[str, list[SrtDoc]] = defaultdict(list)
    for doc in docs:
        hash_groups[doc.sha256].append(doc)

    duplicate_choices: dict[str, str | None] = {}
    duplicate_groups = []
    for sha256, group in hash_groups.items():
        if len(group) == 1:
            continue
        scored = sorted(
            ((title_alignment(doc)[0], doc.bvid, doc) for doc in group),
            reverse=True,
        )
        winner = scored[0][2].bvid if scored[0][0] > scored[1][0] else None
        for doc in group:
            duplicate_choices[doc.bvid] = winner or "__reject_all__"
        duplicate_groups.append(
            {
                "sha256": sha256,
                "bvids": [doc.bvid for doc in group],
                "titles": [doc.title for doc in group],
                "selected": winner,
            }
        )

    audit_rows = []
    for doc in docs:
        choice = duplicate_choices.get(doc.bvid)
        audit_rows.append(audit_doc(doc, choice))

    accepted = [row for row in audit_rows if row["accepted"]]
    docs_by_bvid = {doc.bvid: doc for doc in docs}
    conversation_rows = [
        classify_conversation(docs_by_bvid[row["bvid"]])
        for row in accepted
        if row["bvid"] in docs_by_bvid
    ]
    stated_request_counts: Counter[str] = Counter()
    diagnosed_risk_counts: Counter[str] = Counter()
    protocol_positions: defaultdict[str, list[float]] = defaultdict(list)
    for row in conversation_rows:
        stated_request_counts.update(row["stated_requests"])
        diagnosed_risk_counts.update(row["diagnosed_risks"])
        for label, position in row["question_positions"].items():
            protocol_positions[label].append(100 * position / max(row["text_length"], 1))

    title_stage_counts: Counter[str] = Counter()
    title_problem_counts: Counter[str] = Counter()
    title_rows = []
    for meta in records.values():
        stage, problems = classify_title(meta.get("title", ""))
        title_stage_counts[stage] += 1
        title_problem_counts.update(problems)
        title_rows.append(
            {
                "bvid": meta["bvid"],
                "title": meta.get("title", ""),
                "duration": meta.get("duration", ""),
                "subtitle_status": meta.get("status", ""),
                "title_stage": stage,
                "title_problems": "、".join(problems),
            }
        )

    dimension_counts: Counter[str] = Counter()
    for row in accepted:
        dimension_counts.update(row["dimensions"])

    reason_counts: Counter[str] = Counter()
    for row in audit_rows:
        reason_counts.update(row["exclusion_reasons"])

    total = len(records)
    saved = sum(meta.get("status") == "saved" for meta in records.values())
    report = {
        "methodology": {
            "principle": "高精度优先；疑似错配、重复、过短、无餐饮经营语义的 AI 字幕不进入正文统计",
            "title_statistics_scope": "所有 manifest 标题；可反映频道选题，不代表中国餐饮总体",
            "transcript_statistics_scope": "仅通过质量门槛的字幕；用于分析勇哥的提问与判断维度",
            "conversation_coding": (
                "表面请求只扫描每份高可信字幕开头 2600 字；诊断风险扫描标题与全文；"
                "询问协议仅匹配具体问句/动作并统计首次出现位置。全部为多标签规则编码，"
                "不把词频当作因果，也不假设 AI 字幕具有可靠说话人标签"
            ),
            "thresholds": {
                "min_caption_count": 80,
                "min_restaurant_signal": 40,
                "min_financial_signal": 5,
                "min_dimensions": 4,
                "min_coverage_ratio": 0.18,
            },
        },
        "archive": {
            "expected_total_at_collection_start": args.expected_total,
            "collection_complete": total >= args.expected_total,
            "collection_progress_pct": pct(total, args.expected_total),
            "manifest_unique_videos": total,
            "saved_status": saved,
            "no_ai_zh_status": total - saved,
            "srt_files_parsed": len(docs),
            "missing_saved_files": missing_files,
            "accepted_transcripts": len(accepted),
            "excluded_transcripts": len(audit_rows) - len(accepted),
            "acceptance_rate_pct": pct(len(accepted), len(audit_rows)),
            "unique_subtitle_hashes": len(hash_groups),
            "duplicate_hash_groups": len(duplicate_groups),
        },
        "title_stage_distribution": [
            {"label": label, "count": count, "pct": pct(count, total)}
            for label, count in title_stage_counts.most_common()
        ],
        "title_problem_distribution": [
            {"label": label, "count": count, "pct": pct(count, total)}
            for label, count in title_problem_counts.most_common()
        ],
        "verified_judgment_dimensions": [
            {"label": label, "count": count, "pct": pct(count, len(accepted))}
            for label, count in dimension_counts.most_common()
        ],
        "conversation_coding_coverage": {
            "accepted_transcripts": len(conversation_rows),
            "stated_request_labeled": sum(
                bool(row["stated_requests"]) for row in conversation_rows
            ),
            "stated_request_unlabeled": sum(
                not row["stated_requests"] for row in conversation_rows
            ),
            "stated_request_labeled_pct": pct(
                sum(bool(row["stated_requests"]) for row in conversation_rows),
                len(conversation_rows),
            ),
            "note": "未识别不等于没有问题；为避免误判，模糊表述不强行归类",
        },
        "stated_request_distribution": [
            {"label": label, "count": count, "pct": pct(count, len(conversation_rows))}
            for label, count in stated_request_counts.most_common()
        ],
        "diagnosed_risk_distribution": [
            {"label": label, "count": count, "pct": pct(count, len(conversation_rows))}
            for label, count in diagnosed_risk_counts.most_common()
        ],
        "question_protocol_frequency": sorted(
            [
                {
                    "label": label,
                    "count": len(positions),
                    "pct": pct(len(positions), len(conversation_rows)),
                    "median_first_position_pct": round(statistics.median(positions), 1),
                }
                for label, positions in protocol_positions.items()
            ],
            key=lambda row: (row["median_first_position_pct"], -row["count"]),
        ),
        "exclusion_reason_distribution": [
            {"label": label, "count": count}
            for label, count in reason_counts.most_common()
        ],
        "duplicate_groups": duplicate_groups,
        "conversation_analysis": conversation_rows,
        "transcript_audit": audit_rows,
    }

    args.output.mkdir(parents=True, exist_ok=True)
    report_path = args.output / "corpus_analysis.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    refresh_research_markdown(report, here / "RESEARCH.md")

    with (args.output / "cases.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        fieldnames = [
            "bvid", "title", "duration", "subtitle_status", "title_stage", "title_problems",
        ]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(title_rows)

    with (args.output / "transcript_audit.csv").open(
        "w", encoding="utf-8-sig", newline=""
    ) as handle:
        fieldnames = [
            "bvid", "title", "accepted", "exclusion_reasons", "caption_count",
            "coverage_ratio", "restaurant_signal", "financial_signal", "unrelated_signal",
            "title_body_alignment", "dimensions", "path",
        ]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in audit_rows:
            flat = {key: row.get(key) for key in fieldnames}
            flat["exclusion_reasons"] = "；".join(row["exclusion_reasons"])
            flat["dimensions"] = "、".join(row["dimensions"])
            writer.writerow(flat)

    with (args.output / "accepted_transcripts.csv").open(
        "w", encoding="utf-8-sig", newline=""
    ) as handle:
        fieldnames = [
            "bvid", "title", "caption_count", "coverage_ratio", "restaurant_signal",
            "financial_signal", "title_body_alignment", "dimensions", "path",
        ]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in accepted:
            flat = {key: row.get(key) for key in fieldnames}
            flat["dimensions"] = "、".join(row["dimensions"])
            writer.writerow(flat)

    with (args.output / "conversation_analysis.csv").open(
        "w", encoding="utf-8-sig", newline=""
    ) as handle:
        fieldnames = [
            "bvid", "title", "stated_requests", "diagnosed_risks",
            "request_snippet", "question_protocol",
        ]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in conversation_rows:
            writer.writerow(
                {
                    "bvid": row["bvid"],
                    "title": row["title"],
                    "stated_requests": "、".join(row["stated_requests"]),
                    "diagnosed_risks": "、".join(row["diagnosed_risks"]),
                    "request_snippet": row["request_snippet"],
                    "question_protocol": "、".join(
                        label
                        for label, _ in sorted(
                            row["question_positions"].items(),
                            key=lambda item: item[1],
                        )
                    ),
                }
            )

    print(
        f"已分析 {total} 个标题、{len(docs)} 份字幕；"
        f"正文统计保留 {len(accepted)} 份，剔除 {len(audit_rows) - len(accepted)} 份。"
    )
    if total < args.expected_total:
        print(f"注意：归档尚未完成（{total}/{args.expected_total}）。")
    print(report_path)


if __name__ == "__main__":
    main()
