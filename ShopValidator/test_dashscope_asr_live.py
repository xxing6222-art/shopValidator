#!/usr/bin/env python3
"""Make one real DashScope Fun-ASR-Flash call with Alibaba's public sample.

This is an opt-in network/paid smoke test. It never prints the API key and does
not write audio to disk: DashScope reads the public sample URL directly.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request


DEFAULT_ENDPOINT = (
    "https://dashscope.aliyuncs.com/api/v1/services/"
    "aigc/multimodal-generation/generation"
)
DEFAULT_MODEL = "fun-asr-flash-2026-06-15"
DEFAULT_SAMPLE_URL = (
    "https://dashscope.oss-cn-beijing.aliyuncs.com/"
    "samples/audio/paraformer/hello_world_female2.wav"
)


def extract_transcript(payload: dict[str, object]) -> str:
    """Read both documented Fun-ASR-Flash response paths."""
    output = payload.get("output")
    if not isinstance(output, dict):
        return ""

    direct = output.get("text")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()

    nested_output = output.get("output")
    if not isinstance(nested_output, dict):
        return ""
    sentence = nested_output.get("sentence")
    if not isinstance(sentence, dict):
        return ""
    nested = sentence.get("text")
    return nested.strip() if isinstance(nested, str) else ""


def main() -> None:
    api_key = os.environ.get("DASHSCOPE_API_KEY")
    if not api_key:
        raise RuntimeError("请先在当前 shell 中设置 DASHSCOPE_API_KEY")

    endpoint = os.environ.get("DASHSCOPE_ASR_URL", DEFAULT_ENDPOINT)
    model = os.environ.get("DASHSCOPE_ASR_MODEL", DEFAULT_MODEL)
    sample_url = os.environ.get("DASHSCOPE_ASR_SAMPLE_URL", DEFAULT_SAMPLE_URL)
    payload = {
        "model": model,
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_audio",
                            "input_audio": {"data": sample_url},
                        }
                    ],
                }
            ]
        },
        "parameters": {"format": "wav", "sample_rate": "16000"},
    }
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "X-DashScope-SSE": "disable",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        # Report the service response for diagnosis; request headers (and thus
        # the secret) are never included.
        detail = error.read().decode("utf-8", errors="replace")[:800]
        raise RuntimeError(
            f"DashScope ASR HTTP {error.code}: {detail}"
        ) from error

    transcript = extract_transcript(result)
    if not transcript:
        raise RuntimeError("DashScope ASR 没有返回非空转写")

    normalized = transcript.lower().replace(" ", "")
    expected_terms = ("helloworld", "阿里巴巴", "语音", "实验室")
    missing = [term for term in expected_terms if term not in normalized]
    if missing:
        raise RuntimeError(
            f"DashScope ASR 转写与官方样例明显不符，缺少 {missing!r}："
            f"{transcript!r}"
        )

    request_id = str(result.get("request_id") or "")
    suffix = f", request_id={request_id}" if request_id else ""
    print(
        f"DashScope live ASR: model={model}, transcript={transcript!r}{suffix}"
    )


if __name__ == "__main__":
    main()
