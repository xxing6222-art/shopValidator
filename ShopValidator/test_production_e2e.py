#!/usr/bin/env python3
"""Production acceptance test for 店判 2.1.

This test deliberately exercises the public Worker API without reading any
local API key. It creates one short-lived case, calls TTS once, launches the
paid 2-candidate Agent search, verifies the completed result, and deletes the
case in a ``finally`` block.

The production target requires ``--confirm-paid-analysis`` so an accidental
invocation cannot spend StepFun balance.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Iterable


DEFAULT_BASE_URL = "https://shopvalidator.zhangyvjing.com"
MAX_JSON_BYTES = 16 * 1024 * 1024
MAX_STATIC_BYTES = 3 * 1024 * 1024
MAX_AUDIO_BYTES = 12 * 1024 * 1024


class AcceptanceError(RuntimeError):
    """An assertion or remote API failure that should fail acceptance."""


class ApiError(AcceptanceError):
    def __init__(self, method: str, path: str, status: int, detail: str) -> None:
        super().__init__(f"{method} {path} returned HTTP {status}: {detail}")
        self.status = status


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AcceptanceError(message)


def read_limited(response: Any, limit: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    # Cloudflare static assets may be delivered without Content-Length. A
    # single ``read(limit + 1)`` then waits for the full multi-megabyte limit
    # instead of returning the already-complete small body. ``read1`` consumes
    # the available HTTP chunk and still lets us enforce the same hard cap.
    read_chunk = getattr(response, "read1", response.read)
    while True:
        chunk = read_chunk(min(64 * 1024, limit + 1 - total))
        if not chunk:
            break
        chunks.append(chunk)
        total += len(chunk)
        if total > limit:
            raise AcceptanceError(f"response exceeded the {limit}-byte safety limit")
    return b"".join(chunks)


@dataclass
class HttpResult:
    status: int
    headers: Any
    body: bytes


class ApiClient:
    def __init__(self, base_url: str, request_timeout: float) -> None:
        parsed = urllib.parse.urlsplit(base_url.strip())
        require(parsed.scheme in {"http", "https"}, "base URL must use http or https")
        require(bool(parsed.netloc), "base URL must include a host")
        require(not parsed.query and not parsed.fragment, "base URL cannot include a query or fragment")
        self.base_url = base_url.rstrip("/")
        self.origin = f"{parsed.scheme}://{parsed.netloc}"
        self.hostname = parsed.hostname or ""
        self.request_timeout = request_timeout

    def request(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, Any] | None = None,
        token: str | None = None,
        expected: Iterable[int] = (200,),
        limit: int = MAX_JSON_BYTES,
        accept: str = "application/json",
    ) -> HttpResult:
        url = f"{self.base_url}/{path.lstrip('/')}"
        body = None
        headers = {
            "Accept": accept,
            "Accept-Encoding": "identity",
            "Cache-Control": "no-cache",
            "Origin": self.origin,
            "User-Agent": "ShopLooker-Production-Acceptance/1.0",
        }
        if token:
            headers["X-Case-Token"] = token
        if payload is not None:
            body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, data=body, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=self.request_timeout) as response:
                result = HttpResult(response.status, response.headers, read_limited(response, limit))
        except urllib.error.HTTPError as error:
            detail_bytes = error.read(16_385)
            detail = detail_bytes[:16_384].decode("utf-8", errors="replace").strip()
            if len(detail_bytes) > 16_384:
                detail += "…"
            raise ApiError(method, path, error.code, detail or error.reason) from error
        except urllib.error.URLError as error:
            raise AcceptanceError(f"{method} {path} network failure: {error.reason}") from error

        allowed = set(expected)
        if result.status not in allowed:
            detail = result.body[:2_000].decode("utf-8", errors="replace")
            raise ApiError(method, path, result.status, detail)
        return result

    def json(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, Any] | None = None,
        token: str | None = None,
        expected: Iterable[int] = (200,),
    ) -> dict[str, Any]:
        result = self.request(
            method,
            path,
            payload=payload,
            token=token,
            expected=expected,
            limit=MAX_JSON_BYTES,
        )
        try:
            decoded = json.loads(result.body)
        except json.JSONDecodeError as error:
            raise AcceptanceError(f"{method} {path} did not return valid JSON") from error
        require(isinstance(decoded, dict), f"{method} {path} JSON root must be an object")
        return decoded


def confirmed_fact(
    fact_id: str,
    value: Any,
    *,
    unit: str = "",
    period: str = "",
) -> dict[str, Any]:
    return {
        "id": fact_id,
        "value": value,
        "unit": unit,
        "period": period,
        "status": "confirmed",
    }


def review_fixture() -> list[dict[str, Any]]:
    """Return a complete but explicitly synthetic operating-store case."""
    return [
        confirmed_fact("monthlyRevenue", 120_000, unit="元", period="月"),
        confirmed_fact("dailyOrders", 95, unit="单", period="日"),
        confirmed_fact("avgTicket", 42, unit="元", period="单"),
        confirmed_fact("variableCostRate", 55, unit="%", period="sale"),
        confirmed_fact("fixedCostTotal", 68_000, unit="元", period="月"),
        confirmed_fact("cashReserve", 150_000, unit="元"),
        confirmed_fact("debt", 0, unit="元"),
        confirmed_fact("bottleneck", "午高峰门头转化和客流不足"),
        confirmed_fact("channelMix", "外卖略多于堂食"),
        confirmed_fact("trafficMatch", "yes"),
        confirmed_fact("visibility", "no"),
        confirmed_fact("retention", "no"),
    ]


def deterministic_fixture() -> dict[str, Any]:
    return {
        "decision": "TEST",
        "title": "先做可逆止损实验，不追加长期投入",
        "reason": (
            "按已确认口径，月贡献毛利约5.4万元，完整固定成本约6.8万元，"
            "当前每月约亏1.4万元；先验证门头转化、排班和复购，不签新合同。"
        ),
        "metrics": {
            "monthlyRevenue": 120_000,
            "grossMargin": 0.45,
            "contributionMargin": 54_000,
            "fixedCosts": 68_000,
            "monthlyProfit": -14_000,
            "breakEvenMonthly": 151_111.11,
            "cashRunwayMonths": 10.71,
            "averageTicket": 42,
        },
    }


def validate_audited_candidates(result: dict[str, Any]) -> None:
    require(result.get("requested") == 2, "Agent search did not request exactly 2 candidates")
    require(result.get("generated") == 2, "Agent search did not produce 2 audited candidates")
    require(result.get("mode") == "stepfun-search", "Agent search fell back instead of using StepFun")
    audited = result.get("audited")
    require(isinstance(audited, list) and len(audited) == 2, "audited candidate list must contain 2 items")
    for index, audit in enumerate(audited, start=1):
        require(isinstance(audit, dict), f"audited candidate {index} is not an object")
        candidate = audit.get("candidate")
        require(isinstance(candidate, dict), f"audited candidate {index} has no candidate payload")
        verification = audit.get("verification")
        require(isinstance(verification, dict), f"audited candidate {index} has no verification record")
        evidence = verification.get("evidence")
        execution = verification.get("execution")
        require(
            isinstance(evidence, dict) and evidence.get("kind") == "evidence",
            f"audited candidate {index} is missing the evidence/causality verification",
        )
        require(
            isinstance(execution, dict) and execution.get("kind") == "execution",
            f"audited candidate {index} is missing the finance/execution verification",
        )


def validate_top_plans(result: dict[str, Any]) -> list[dict[str, Any]]:
    plans = result.get("top3")
    require(isinstance(plans, list), "Top 3 field is not a list")
    require(1 <= len(plans) <= 3, "completed analysis must return one to three usable plans")
    ids: set[str] = set()
    signatures: set[str] = set()
    required = (
        "id",
        "bottleneck",
        "mechanism",
        "action",
        "budget_cap",
        "duration_days",
        "metric",
        "success_line",
        "stop_line",
    )
    for index, plan in enumerate(plans, start=1):
        require(isinstance(plan, dict), f"Top plan {index} is not an object")
        for field in required:
            require(plan.get(field) not in (None, ""), f"Top plan {index} is missing {field}")
        plan_id = str(plan["id"])
        require(plan_id not in ids, "Top plans contain a duplicate id")
        ids.add(plan_id)
        signature = (
            f"{plan.get('domain', '')}|{plan['mechanism']}|{plan['metric']}"
            .lower()
            .replace(" ", "")
        )
        require(signature not in signatures, "Top plans contain duplicate mechanisms")
        signatures.add(signature)
    return plans


def poll_run(
    client: ApiClient,
    case_id: str,
    token: str,
    run_id: str,
    *,
    timeout: float,
    poll_interval: float,
    log: Any,
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    last_progress = ""
    transient_failures = 0
    while time.monotonic() < deadline:
        try:
            run = client.json("GET", f"/api/cases/{case_id}/runs/{run_id}", token=token)
            transient_failures = 0
        except (ApiError, AcceptanceError) as error:
            transient_failures += 1
            if transient_failures >= 4:
                raise
            log(f"  polling transient failure {transient_failures}/3: {error}")
            time.sleep(poll_interval)
            continue

        require(run.get("id") == run_id, "polling returned the wrong analysis run")
        require(run.get("stale") is False, "analysis became stale before completion")
        status = run.get("status")
        progress = run.get("progress") if isinstance(run.get("progress"), dict) else {}
        progress_label = json.dumps(
            {
                "status": status,
                "phase": progress.get("phase"),
                "round": progress.get("round"),
                "completed": progress.get("completed"),
                "target": progress.get("target"),
            },
            ensure_ascii=False,
            sort_keys=True,
        )
        if progress_label != last_progress:
            log(f"  {progress_label}")
            last_progress = progress_label
        if status == "completed":
            return run
        if status == "failed":
            raise AcceptanceError(f"analysis run failed: {run.get('warning') or 'unknown reason'}")
        require(status in {"queued", "running"}, f"unexpected analysis status: {status!r}")
        time.sleep(poll_interval)
    raise AcceptanceError(f"analysis did not finish within {timeout:.0f} seconds")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Run one paid, disposable end-to-end acceptance case against 店判. "
            "No local API keys are read or transmitted."
        )
    )
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="site origin to test")
    parser.add_argument(
        "--address",
        default="上海市黄浦区南京东路299号",
        help="address resolved through the deployed Tencent Map proxy",
    )
    parser.add_argument("--category", default="快餐", help="nearby-POI category")
    parser.add_argument("--analysis-timeout", type=float, default=900, help="maximum polling seconds")
    parser.add_argument("--poll-interval", type=float, default=5, help="polling interval seconds")
    parser.add_argument("--request-timeout", type=float, default=45, help="per-request timeout seconds")
    parser.add_argument(
        "--confirm-paid-analysis",
        action="store_true",
        help="acknowledge that production analysis makes multiple paid StepFun Agent calls",
    )
    parser.add_argument("--json", action="store_true", help="emit the final summary as JSON")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    client = ApiClient(args.base_url, args.request_timeout)
    if client.hostname == "shopvalidator.zhangyvjing.com" and not args.confirm_paid_analysis:
        raise AcceptanceError(
            "production target requires --confirm-paid-analysis because the search "
            "makes multiple paid StepFun calls"
        )
    require(args.analysis_timeout >= 60, "--analysis-timeout must be at least 60 seconds")
    require(args.poll_interval >= 0.5, "--poll-interval must be at least 0.5 seconds")

    def log(message: str) -> None:
        print(message, file=sys.stderr if args.json else sys.stdout, flush=True)

    case_id = ""
    token = ""
    deleted = False
    public_id = ""
    public_manage_token = ""
    site_case_id = ""
    site_token = ""
    site_deleted = False
    summary: dict[str, Any] = {
        "baseUrl": client.base_url,
        "static": False,
        "location": False,
        "tts": False,
        "review": False,
        "analysis": False,
        "reused": False,
        "planStarted": False,
        "publishedToLeaderboard": False,
        "siteReportPersisted": False,
        "deleted": False,
    }
    started = time.monotonic()
    try:
        log("[1/12] Checking the deployed page and application bundle")
        page = client.request("GET", "/", expected=(200,), limit=MAX_STATIC_BYTES, accept="text/html")
        html = page.body.decode("utf-8", errors="replace")
        require("勇哥判店" in html and 'id="beginInterview"' in html, "deployed HTML is not the current 店判 flow")
        bundle = client.request(
            "GET",
            "/app.js",
            expected=(200,),
            limit=MAX_STATIC_BYTES,
            accept="text/javascript,application/javascript",
        )
        script = bundle.body.decode("utf-8", errors="replace")
        require("startAnalysis" in script and "startDemoInterview" in script, "deployed app bundle is incomplete")
        summary["static"] = True

        log("[2/12] Creating a disposable case")
        created = client.json("POST", "/api/cases", payload={"stage": "operating"}, expected=(201,))
        case_id = str(created.get("case", {}).get("id") or "")
        token = str(created.get("caseToken") or "")
        require(case_id.startswith("case_"), "case creation returned an invalid id")
        require(token.startswith("token_"), "case creation returned an invalid access token")

        log("[3/12] Resolving and confirming the store location")
        query = urllib.parse.urlencode({"address": args.address, "category": args.category})
        mapped = client.json("GET", f"/api/map/address-context?{query}")
        context = mapped.get("context")
        require(isinstance(context, dict), "map response has no context")
        location = context.get("location")
        require(
            isinstance(location, dict) and bool(location.get("address")),
            "map response has no resolved address",
        )
        nearby = context.get("nearby")
        require(isinstance(nearby, dict), "map response has no nearby-POI background")
        saved_location = client.json(
            "POST",
            f"/api/cases/{case_id}/location",
            token=token,
            payload={"confirmed": True, "context": context},
        )
        require(
            isinstance(saved_location.get("firstQuestion"), dict),
            "location confirmation did not initialize the interview",
        )
        summary["location"] = True
        summary["resolvedDistrict"] = location.get("district") or ""

        log("[4/12] Calling deployed StepFun TTS once (audio stays in memory)")
        tts = client.request(
            "POST",
            "/api/tts",
            token=token,
            payload={"caseId": case_id, "text": "现在开始店铺经营问诊。"},
            expected=(200,),
            limit=MAX_AUDIO_BYTES,
            accept="audio/mpeg,audio/*",
        )
        content_type = str(tts.headers.get("Content-Type") or "").lower()
        require("json" not in content_type, "TTS returned JSON instead of audio")
        require(len(tts.body) >= 1_000, "TTS audio response is unexpectedly small")
        summary["tts"] = True
        summary["ttsBytes"] = len(tts.body)

        log("[5/12] Confirming the synthetic facts through the review API")
        facts = review_fixture()
        reviewed = client.json(
            "POST",
            f"/api/cases/{case_id}/review",
            token=token,
            payload={"corrections": facts},
        )
        returned_facts = reviewed.get("facts")
        require(isinstance(returned_facts, list), "fact review returned no fact archive")
        require(len(returned_facts) >= len(facts), "fact review lost confirmed facts")
        require(isinstance(reviewed.get("version"), int), "fact review returned no case version")
        summary["review"] = True
        summary["confirmedFacts"] = len(facts)
        summary["caseVersion"] = reviewed["version"]

        log("[6/12] Launching and polling the paid 2-candidate search")
        deterministic = deterministic_fixture()
        launched = client.json(
            "POST",
            f"/api/cases/{case_id}/analyze",
            token=token,
            payload={"deterministicResult": deterministic},
            expected=(202,),
        )
        run_id = str(launched.get("runId") or "")
        require(run_id.startswith("run_"), "analysis launch returned an invalid run id")
        run = poll_run(
            client,
            case_id,
            token,
            run_id,
            timeout=args.analysis_timeout,
            poll_interval=args.poll_interval,
            log=log,
        )
        result = run.get("result")
        require(isinstance(result, dict), "completed run has no result")
        validate_audited_candidates(result)
        plans = validate_top_plans(result)
        summary["analysis"] = True
        summary["generated"] = result["generated"]
        summary["verified"] = int(result.get("verified") or 0)
        summary["rejected"] = len(result.get("rejected") or [])
        summary["top3"] = len(plans)

        log("[7/12] Verifying same-version analysis reuses the completed run")
        reused = client.json(
            "POST",
            f"/api/cases/{case_id}/analyze",
            token=token,
            payload={"deterministicResult": deterministic},
            expected=(200,),
        )
        require(reused.get("reused") is True, "same-version analysis was not marked as reused")
        require(reused.get("runId") == run_id, "same-version analysis created a different run")
        require(reused.get("status") == "completed", "reused run is not completed")
        summary["reused"] = True

        log("[8/12] Starting the highest-ranked plan")
        selected = client.json(
            "POST",
            f"/api/cases/{case_id}/plans/{urllib.parse.quote(str(plans[0]['id']), safe='')}/start",
            token=token,
            payload={},
        )
        checklist = selected.get("checklist")
        require(isinstance(checklist, list) and len(checklist) == 5, "plan start returned no 5-step checklist")
        require(selected.get("selectedPlanId") == plans[0]["id"], "plan start selected the wrong plan")
        summary["planStarted"] = True

        log("[9/12] Verifying automatic-publication eligibility and leaderboard visibility")
        published = client.json(
            "POST",
            f"/api/cases/{case_id}/publish",
            token=token,
            payload={},
            expected=(201,),
        )
        public_id = str(published.get("publicId") or "")
        public_manage_token = str(published.get("manageToken") or "")
        require(public_id.startswith("public_"), "publication returned an invalid public case id")
        require(public_manage_token.startswith("manage_"), "publication returned no manage token")
        ranked = client.json("GET", "/api/leaderboard")
        ranked_cases = ranked.get("cases")
        require(isinstance(ranked_cases, list), "leaderboard returned no case list")
        require(any(item.get("id") == public_id for item in ranked_cases), "published case is absent from leaderboard")
        summary["publishedToLeaderboard"] = True

        log("[10/12] Unpublishing the disposable leaderboard snapshot")
        unpublished = client.json(
            "DELETE",
            f"/api/public-cases/{public_id}",
            payload={"manageToken": public_manage_token},
        )
        require(unpublished.get("unpublished") is True, "public test snapshot was not removed")
        public_id = ""
        public_manage_token = ""

        log("[11/12] Verifying a pre-open report is persisted and can be read again")
        site_created = client.json(
            "POST", "/api/cases", payload={"stage": "preopen", "category": "我不知道"}, expected=(201,)
        )
        site_case_id = str(site_created.get("case", {}).get("id") or "")
        site_token = str(site_created.get("caseToken") or "")
        require(site_case_id.startswith("case_") and site_token.startswith("token_"), "pre-open case creation failed")
        client.json(
            "POST", f"/api/cases/{site_case_id}/location", token=site_token,
            payload={"confirmed": True, "context": context},
        )
        site_report = client.json(
            "POST", f"/api/cases/{site_case_id}/analyze", token=site_token,
            payload={"mode": "site-map", "category": "我不知道"}, expected=(200,),
        )
        site_run_id = str(site_report.get("runId") or "")
        require(site_run_id.startswith("run_") and site_report.get("status") == "complete", "pre-open report did not complete")
        persisted_site_run = client.json("GET", f"/api/cases/{site_case_id}/runs/{site_run_id}", token=site_token)
        persisted_result = persisted_site_run.get("result")
        require(persisted_site_run.get("status") == "completed", "persisted pre-open run is not completed")
        require(isinstance(persisted_result, dict) and persisted_result.get("reportMode") == "site-map", "pre-open report was not retrievable from storage")
        require(persisted_result.get("topPlans") == site_report.get("result", {}).get("topPlans"), "retrieved pre-open result differs from stored result")
        summary["siteReportPersisted"] = True

        log("[12/12] Deleting both disposable private cases")
        site_deletion = client.json("DELETE", f"/api/cases/{site_case_id}", token=site_token)
        require(site_deletion.get("deleted") is True, "pre-open disposable case was not deleted")
        site_deleted = True
        deletion = client.json("DELETE", f"/api/cases/{case_id}", token=token)
        require(deletion.get("deleted") is True, "case deletion was not acknowledged")
        deleted = True
        summary["deleted"] = True
        try:
            client.json(
                "GET",
                f"/api/cases/{case_id}/runs/{run_id}",
                token=token,
                expected=(200,),
            )
        except ApiError as error:
            require(error.status == 404, "deleted case remained reachable or returned an unexpected status")
        else:
            raise AcceptanceError("deleted case is still reachable")

        summary["elapsedSeconds"] = round(time.monotonic() - started, 1)
        if args.json:
            print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
        else:
            log(
                "PASS: static page, map location, TTS, fact review, 2 audited "
                f"candidates, {len(plans)} Top plans, run reuse, execution checklist, "
                "anonymous leaderboard publication, pre-open persistence/readback, and deletion all passed."
            )
            log(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))
        return 0
    finally:
        if public_id and public_manage_token:
            try:
                client.json("DELETE", f"/api/public-cases/{public_id}", payload={"manageToken": public_manage_token})
                log("Cleanup: disposable public snapshot removed after an incomplete run.")
            except Exception as cleanup_error:  # noqa: BLE001 - cleanup must not hide the root failure
                log(f"WARNING: public snapshot cleanup failed: {cleanup_error}")
        if site_case_id and site_token and not site_deleted:
            try:
                cleanup = client.json("DELETE", f"/api/cases/{site_case_id}", token=site_token)
                log("Cleanup: disposable pre-open case deleted after an incomplete run.")
                site_deleted = cleanup.get("deleted") is True
            except Exception as cleanup_error:  # noqa: BLE001 - cleanup must not hide the root failure
                log(f"WARNING: pre-open case cleanup failed: {cleanup_error}")
        if case_id and token and not deleted:
            try:
                cleanup = client.json("DELETE", f"/api/cases/{case_id}", token=token)
                summary["deleted"] = cleanup.get("deleted") is True
                log("Cleanup: disposable case deleted after an incomplete run.")
            except Exception as cleanup_error:  # noqa: BLE001 - cleanup must not hide the root failure
                log(f"WARNING: automatic case cleanup failed: {cleanup_error}")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AcceptanceError as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
