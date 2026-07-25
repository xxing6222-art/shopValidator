import assert from "node:assert/strict";

const baseUrl = String(
  process.env.PRODUCTION_URL || "https://shopvalidator.zhangyvjing.com"
).replace(/\/+$/, "");
const sampleUrl = process.env.DASHSCOPE_ASR_SAMPLE_URL
  || "https://dashscope.oss-cn-beijing.aliyuncs.com/samples/audio/paraformer/hello_world_female2.wav";

async function readJson(response) {
  return response.json().catch(() => ({}));
}

const createResponse = await fetch(`${baseUrl}/api/cases`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Origin": baseUrl
  },
  body: JSON.stringify({ stage: "operating", category: "ASR生产冒烟测试" })
});
assert.equal(createResponse.status, 201);
const created = await readJson(createResponse);
const caseId = created.case?.id;
const caseToken = created.caseToken;
assert.ok(caseId && caseToken, "生产建案没有返回案卷和令牌");

try {
  const sampleResponse = await fetch(sampleUrl);
  assert.equal(sampleResponse.status, 200);
  const wav = await sampleResponse.arrayBuffer();
  assert.ok(wav.byteLength > 44, "官方WAV样例为空");

  const asrResponse = await fetch(`${baseUrl}/api/cases/${encodeURIComponent(caseId)}/asr`, {
    method: "POST",
    headers: {
      "Content-Type": "audio/wav",
      "Accept": "application/json",
      "Origin": baseUrl,
      "X-Case-Token": caseToken
    },
    body: wav
  });
  const result = await readJson(asrResponse);
  assert.equal(
    asrResponse.status,
    200,
    `生产ASR失败：${asrResponse.status} ${result.message || result.code || ""}`
  );
  assert.equal(result.model, "fun-asr-flash-2026-06-15");
  assert.match(String(result.text || ""), /Hello World|阿里巴巴|语音实验室/i);
  console.log(`production ASR smoke: ${result.model}, ${result.text}`);
} finally {
  await fetch(`${baseUrl}/api/cases/${encodeURIComponent(caseId)}`, {
    method: "DELETE",
    headers: {
      "Origin": baseUrl,
      "X-Case-Token": caseToken
    }
  }).catch(() => {});
}
