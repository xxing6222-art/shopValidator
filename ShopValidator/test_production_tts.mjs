import assert from "node:assert/strict";

const baseUrl = String(process.env.PRODUCTION_URL || "https://shopvalidator.zhangyvjing.com").replace(/\/+$/, "");
const createResponse = await fetch(`${baseUrl}/api/cases`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "Origin": baseUrl },
  body: JSON.stringify({ stage: "operating", category: "TTS生产冒烟测试" })
});
assert.equal(createResponse.status, 201);
const created = await createResponse.json();
const caseId = created.case?.id;
const caseToken = created.caseToken;
assert.ok(caseId && caseToken, "生产建案没有返回案卷和令牌");

try {
  const response = await fetch(`${baseUrl}/api/tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "audio/*",
      "Origin": baseUrl,
      "X-Case-Token": caseToken
    },
    body: JSON.stringify({ caseId, text: "你好，欢迎使用店判。" })
  });
  const audio = await response.arrayBuffer();
  assert.equal(response.status, 200, `生产 TTS 失败：${response.status}`);
  assert.match(response.headers.get("Content-Type") || "", /^audio\//);
  assert.ok(audio.byteLength > 64, "生产 TTS 没有返回可播放音频");
  console.log(`production TTS smoke: ${response.headers.get("Content-Type")}, ${audio.byteLength} bytes`);
} finally {
  await fetch(`${baseUrl}/api/cases/${encodeURIComponent(caseId)}`, {
    method: "DELETE", headers: { "Origin": baseUrl, "X-Case-Token": caseToken }
  }).catch(() => {});
}
