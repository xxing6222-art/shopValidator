import assert from "node:assert/strict";
import worker, {
  AgentGate,
  asrSessionConfig,
  claimAnalysisRound,
  enqueueAnalysisRound,
  handleQueueMessageFailure,
  normalizeAsrClientEvent,
  publicDataScore,
  publicRunSnapshot,
  releaseAnalysisRoundClaim
} from "./worker.mjs";

const originalFetch = globalThis.fetch;
const upstreamCalls = [];
let stepfunActive = 0;
let stepfunMaxActive = 0;
let stepfunFailuresRemaining = 0;

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input);
  upstreamCalls.push({ url, init });
  if (url.hostname === "api.stepfun.com") {
    if (stepfunFailuresRemaining > 0) {
      stepfunFailuresRemaining -= 1;
      throw new Error("模拟抽取模型网络故障");
    }
    stepfunActive += 1;
    stepfunMaxActive = Math.max(stepfunMaxActive, stepfunActive);
    await new Promise((resolve) => setTimeout(resolve, 15));
    stepfunActive -= 1;
    return Response.json({
      choices: [{ message: { content: JSON.stringify({ ok: true }) } }]
    });
  }

  if (url.hostname === "dashscope.aliyuncs.com") {
    const body = JSON.parse(init.body || "{}");
    if (body.model === "qwen3-tts-instruct-flash") {
      return Response.json({
        output: { audio: { data: Buffer.from("RIFFdemo-wav").toString("base64"), format: "wav" } },
        request_id: "dashscope-tts-test"
      });
    }
    return Response.json({
      output: { text: "Hello World，这里是阿里巴巴语音实验室。" },
      request_id: "dashscope-request-test"
    });
  }

  if (url.pathname.includes("/location/v1/ip")) {
    return Response.json({
      status: 0,
      result: {
        location: { lat: 31.2304, lng: 121.4737 },
        ad_info: {
          province: "上海市",
          city: "上海市",
          district: "黄浦区",
          adcode: "310101"
        }
      }
    });
  }

  if (url.pathname.includes("/coord/")) {
    return Response.json({ status: 0, locations: [{ lat: 31.2304, lng: 121.4737 }] });
  }

  if (url.pathname.includes("/geocoder/") && url.searchParams.has("address")) {
    const address = url.searchParams.get("address");
    if (address === "备用Key测试地址" && url.searchParams.get("key") === "test-key") {
      return Response.json({ status: 120, message: "主密钥额度已用尽" });
    }
    if (address === "上游失败测试地址") {
      return Response.json({ status: 120, message: "模拟上游错误" });
    }
    if (address === "上海市") {
      return Response.json({
        status: 0,
        result: { level: "城市", location: { lat: 31.2304, lng: 121.4737 } }
      });
    }
    return Response.json({
      status: 0,
      result: {
        level: "门牌号",
        reliability: 9,
        location: { lat: 31.2304, lng: 121.4737 }
      }
    });
  }

  if (url.pathname.includes("/geocoder/")) {
    return Response.json({
      status: 0,
      result: {
        address: "上海市黄浦区测试路1号",
        address_component: { province: "上海市", city: "上海市", district: "黄浦区" },
        ad_info: { adcode: "310101" },
        pois: [{ title: "测试商场", category: "购物:商场", _distance: 80, _dir_desc: "东" }]
      }
    });
  }

  if (url.pathname.includes("/staticmap/")) {
    return new Response("static-map-fixture", {
      headers: { "Content-Type": "image/png" }
    });
  }

  return Response.json({
    status: 0,
    count: 2,
    data: [
      { title: "咖啡一号", category: "美食:咖啡厅", _distance: 120 },
      { title: "咖啡二号", category: "美食:咖啡厅", _distance: 260 }
    ]
  });
};

const assets = { fetch: async () => new Response("asset") };
const env = { TENCENT_MAP_KEY: "test-key", ASSETS: assets };
const request = (path, headers = {}) => worker.fetch(
  new Request(`https://example.com${path}`, {
    headers: { "CF-Connecting-IP": "203.0.113.77", ...headers }
  }),
  env
);
const apiRequest = (path, { method = "GET", token, body, headers = {} } = {}) => worker.fetch(
  new Request(`https://example.com${path}`, {
    method,
    headers: {
      "CF-Connecting-IP": "203.0.113.78",
      ...headers,
      ...(token ? { "X-Case-Token": token } : {}),
      ...(body !== undefined && !("Content-Type" in headers)
        ? { "Content-Type": "application/json" }
        : {})
    },
    body: body instanceof ArrayBuffer || ArrayBuffer.isView(body)
      ? body
      : body !== undefined
        ? JSON.stringify(body)
        : undefined
  }),
  env
);

function validWavFixture() {
  const bytes = new Uint8Array(46);
  const writeAscii = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) {
      bytes[offset + index] = value.charCodeAt(index);
    }
  };
  const view = new DataView(bytes.buffer);
  writeAscii(0, "RIFF");
  view.setUint32(4, 38, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, 2, true);
  view.setInt16(44, 0, true);
  return bytes.buffer;
}

function mutateWavFixture(mutator) {
  const wav = validWavFixture();
  mutator(new DataView(wav), new Uint8Array(wav));
  return wav;
}

try {
  const publicData = publicDataScore({
    stage: "operating", location: { confirmed: true }, turns: [
      { field: "monthlyRevenue" }, { field: "variableCostRate" }, { field: "fixedCostTotal" }, { field: "cashReserve" }, { field: "debt" }, { field: "bottleneck" }
    ],
    facts: Object.fromEntries(["monthlyRevenue", "variableCostRate", "fixedCostTotal", "cashReserve", "debt", "bottleneck"].map((field) => [field, { field, status: "confirmed", value: 1 }]))
  });
  assert.ok(publicData >= 70 && publicData <= 100);
  const sharedSnapshot = {
    stage: "operating",
    category: "小吃",
    decision: "TEST",
    conclusion: "小步验证",
    decisionTitle: "先验证午市需求",
    decisionReason: "关键经营信号尚需验证",
    signals: [{ label: "当前瓶颈", value: "午市客流", status: "confirmed" }],
    plans: [{ role: "主方案", title: "午市试卖", action: "连续七天记录订单", budgetCap: 500, durationDays: 7, metric: "订单", successLine: "增长", stopLine: "停止" }],
    evidenceScore: 82
  };
  const sharedDb = {
    prepare(sql) {
      return {
        bind(id) {
          return {
            async first() {
              if (sql.includes("FROM public_cases") && id === "public_share_fixture") {
                return {
                  id,
                  source_case_id: "private_case_must_not_leak",
                  manage_token_hash: "secret_must_not_leak",
                  snapshot_json: JSON.stringify(sharedSnapshot),
                  data_score: 82,
                  outcome_score: 0,
                  rank_score: 57,
                  is_active: 1,
                  created_at: "2026-07-25T00:00:00.000Z",
                  updated_at: "2026-07-25T01:00:00.000Z"
                };
              }
              return null;
            }
          };
        }
      };
    }
  };
  const sharedResponse = await worker.fetch(
    new Request("https://example.com/api/public-cases/public_share_fixture", { headers: { "CF-Connecting-IP": "203.0.113.99" } }),
    { DB: sharedDb }
  );
  assert.equal(sharedResponse.status, 200);
  const sharedBody = await sharedResponse.json();
  assert.equal(sharedBody.id, "public_share_fixture");
  assert.equal(sharedBody.decisionTitle, "先验证午市需求");
  assert.equal(sharedBody.sourceCaseId, undefined);
  assert.equal(sharedBody.source_case_id, undefined);
  assert.equal(sharedBody.manageTokenHash, undefined);
  assert.equal(sharedBody.manage_token_hash, undefined);
  assert.equal(JSON.stringify(sharedBody).includes("secret_must_not_leak"), false);
  const missingSharedResponse = await worker.fetch(
    new Request("https://example.com/api/public-cases/public_missing", { headers: { "CF-Connecting-IP": "203.0.113.99" } }),
    { DB: sharedDb }
  );
  assert.equal(missingSharedResponse.status, 404);
  const asrConfig = asrSessionConfig({});
  assert.equal(asrConfig.session.audio.input.format.codec, "pcm_s16le");
  assert.equal(asrConfig.session.audio.input.format.rate, 16000);
  assert.equal(asrConfig.session.audio.input.transcription.model, "stepaudio-2.5-asr-stream");
  assert.equal(asrConfig.session.audio.input.transcription.full_rerun_on_commit, true);
  assert.equal(asrConfig.session.audio.input.turn_detection.silence_duration_ms, 350);
  const normalizedAudio = normalizeAsrClientEvent({
    type: "input_audio_buffer.append",
    audio: "AQID"
  });
  assert.equal(normalizedAudio.type, "input_audio_buffer.append");
  assert.equal(normalizedAudio.audio, "AQID");
  assert.match(normalizedAudio.event_id, /^event_/);
  assert.equal(normalizeAsrClientEvent({ type: "session.update", session: {} }), null);
  assert.equal(normalizeAsrClientEvent({ type: "dangerous.unapproved.command" }), null);

  const gpsStart = upstreamCalls.length;
  const gpsResponse = await request("/api/map/context?lat=31.22&lng=121.47&category=咖啡");
  assert.equal(gpsResponse.status, 200);
  const gps = await gpsResponse.json();
  assert.equal(gps.context.mode, "gps");
  assert.equal(gps.context.location.district, "黄浦区");
  assert.equal(gps.context.location.latitude, 31.2304);
  assert.equal(gps.context.location.longitude, 121.4737);
  assert.equal(gps.context.nearby.count, 2);
  const gpsCalls = upstreamCalls.slice(gpsStart);
  assert.equal(gpsCalls.length, 3);
  assert.match(gpsCalls[0].url.pathname, /coord/);
  assert.equal(gpsCalls[0].url.searchParams.get("type"), "1");
  assert.equal(gpsCalls[0].init.headers.Referer, "https://shopvalidator.zhangyvjing.com/");

  const addressStart = upstreamCalls.length;
  const addressResponse = await request(
    "/api/map/address-context?address=上海市黄浦区测试路1号&category=咖啡"
  );
  assert.equal(addressResponse.status, 200);
  const address = await addressResponse.json();
  assert.equal(address.context.mode, "address");
  assert.equal(address.context.location.address, "上海市黄浦区测试路1号");
  const addressCalls = upstreamCalls.slice(addressStart);
  assert.equal(addressCalls.length, 3);
  assert.equal(addressCalls.some(({ url }) => url.pathname.includes("/coord/")), false);
  assert.equal(addressCalls[0].url.searchParams.get("address"), "上海市黄浦区测试路1号");

  const fallbackStart = upstreamCalls.length;
  const fallbackResponse = await worker.fetch(
    new Request("https://example.com/api/map/address-context?address=备用Key测试地址&category=咖啡"),
    { ...env, TENCENT_MAP_KEY_SECONDARY: "backup-test-key" }
  );
  assert.equal(fallbackResponse.status, 200);
  const fallbackCalls = upstreamCalls.slice(fallbackStart);
  assert.equal(fallbackCalls[0].url.searchParams.get("key"), "test-key");
  assert.equal(fallbackCalls[1].url.searchParams.get("key"), "backup-test-key");

  const pickedResponse = await request("/api/map/pick-context?lat=31.2304&lng=121.4737&category=咖啡");
  assert.equal(pickedResponse.status, 200);
  const picked = await pickedResponse.json();
  assert.equal(picked.context.mode, "map-picker");
  assert.equal(picked.context.location.latitude, 31.2304);

  const staticResponse = await request("/api/map/static?lat=31.2304&lng=121.4737&zoom=16");
  assert.equal(staticResponse.status, 200);
  assert.equal(staticResponse.headers.get("Content-Type"), "image/png");
  assert.equal(await staticResponse.text(), "static-map-fixture");
  const staticCall = upstreamCalls.at(-1);
  assert.match(staticCall.url.pathname, /staticmap/);
  assert.equal(staticCall.url.searchParams.get("center"), "31.230400,121.473700");
  assert.equal(staticCall.url.searchParams.get("size"), "640*360");

  const broadStart = upstreamCalls.length;
  const broadResponse = await request("/api/map/address-context?address=上海市");
  assert.equal(broadResponse.status, 422);
  const broad = await broadResponse.json();
  assert.equal(broad.code, "ADDRESS_TOO_BROAD");
  assert.equal(upstreamCalls.length - broadStart, 0);

  const upstreamFailure = await request("/api/map/address-context?address=上游失败测试地址");
  assert.equal(upstreamFailure.status, 502);
  assert.equal((await upstreamFailure.json()).code, "ADDRESS_LOOKUP_ERROR");

  const ipStart = upstreamCalls.length;
  const ipResponse = await request("/api/map/ip-location", {
    "CF-Connecting-IP": "203.0.113.8"
  });
  assert.equal(ipResponse.status, 200);
  const ip = await ipResponse.json();
  assert.equal(ip.approximate.label, "上海市黄浦区");
  assert.equal("location" in ip.approximate, false);
  assert.equal("lat" in ip.approximate, false);
  assert.equal("lng" in ip.approximate, false);
  assert.equal("nearby" in ip.approximate, false);
  const ipCalls = upstreamCalls.slice(ipStart);
  assert.equal(ipCalls.length, 1);
  assert.match(ipCalls[0].url.pathname, /location\/v1\/ip/);
  assert.equal(ipCalls[0].url.searchParams.get("ip"), "203.0.113.8");

  const noIpStart = upstreamCalls.length;
  const noIpResponse = await request("/api/map/ip-location", { "CF-Connecting-IP": "" });
  assert.equal(noIpResponse.status, 422);
  assert.equal(upstreamCalls.length, noIpStart);

  const missingKey = await worker.fetch(
    new Request("https://example.com/api/map/context?lat=31.22&lng=121.47"),
    { ASSETS: assets }
  );
  assert.equal(missingKey.status, 503);

  const invalidCoordinate = await request("/api/map/context?lat=999&lng=121.47");
  assert.equal(invalidCoordinate.status, 400);

  const invalidAddress = await request("/api/map/address-context?address=上海");
  assert.equal(invalidAddress.status, 400);

  const asset = await request("/");
  assert.equal(await asset.text(), "asset");

  const createdResponse = await apiRequest("/api/cases", {
    method: "POST",
    body: { stage: "operating" }
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.match(created.case.id, /^case_/);
  assert.match(created.caseToken, /^token_/);

  const missingLocation = await apiRequest(`/api/cases/${created.case.id}/turns`, {
    method: "POST",
    token: created.caseToken,
    body: { turnId: "turn-1", transcript: "一个月大约十万元" }
  });
  assert.equal(missingLocation.status, 409);

  const locationResponse = await apiRequest(`/api/cases/${created.case.id}/location`, {
    method: "POST",
    token: created.caseToken,
    body: {
      confirmed: true,
      context: {
        location: { address: "上海市黄浦区测试路1号" },
        nearby: { count: 2 }
      }
    }
  });
  assert.equal(locationResponse.status, 200);
  assert.equal((await locationResponse.json()).firstQuestion.complete, false);

  env.DASHSCOPE_API_KEY = "dashscope-server-only-key";
  const asrStart = upstreamCalls.length;
  const asrResponse = await apiRequest(`/api/cases/${created.case.id}/asr`, {
    method: "POST",
    token: created.caseToken,
    headers: { "Content-Type": "audio/wav" },
    body: validWavFixture()
  });
  assert.equal(asrResponse.status, 200);
  const asr = await asrResponse.json();
  assert.equal(asr.text, "Hello World，这里是阿里巴巴语音实验室。");
  assert.equal(asr.requestId, "dashscope-request-test");
  assert.equal(asr.model, "fun-asr-flash-2026-06-15");
  const asrCalls = upstreamCalls.slice(asrStart);
  assert.equal(asrCalls.length, 1);
  assert.equal(
    asrCalls[0].url.href,
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
  );
  assert.equal(asrCalls[0].init.method, "POST");
  assert.equal(asrCalls[0].init.headers.Authorization, "Bearer dashscope-server-only-key");
  assert.equal(asrCalls[0].init.headers["X-DashScope-SSE"], "disable");
  const dashScopeBody = JSON.parse(asrCalls[0].init.body);
  assert.equal(dashScopeBody.model, "fun-asr-flash-2026-06-15");
  assert.deepEqual(dashScopeBody.parameters, { format: "wav", sample_rate: "16000" });
  assert.match(
    dashScopeBody.input.messages.at(-1).content[0].input_audio.data,
    /^data:audio\/wav;base64,/
  );
  assert.match(
    dashScopeBody.input.messages[0].content[0].text,
    /营业额/
  );

  const invalidWavResponse = await apiRequest(`/api/cases/${created.case.id}/asr`, {
    method: "POST",
    token: created.caseToken,
    headers: { "Content-Type": "audio/wav" },
    body: new Uint8Array(44).buffer
  });
  assert.equal(invalidWavResponse.status, 422);
  assert.equal((await invalidWavResponse.json()).code, "ASR_AUDIO_INVALID");

  const nonPcmWavResponse = await apiRequest(`/api/cases/${created.case.id}/asr`, {
    method: "POST",
    token: created.caseToken,
    headers: { "Content-Type": "audio/wav" },
    body: mutateWavFixture((view) => view.setUint16(20, 3, true))
  });
  assert.equal(nonPcmWavResponse.status, 422);

  const stereoWavResponse = await apiRequest(`/api/cases/${created.case.id}/asr`, {
    method: "POST",
    token: created.caseToken,
    headers: { "Content-Type": "audio/wav" },
    body: mutateWavFixture((view) => view.setUint16(22, 2, true))
  });
  assert.equal(stereoWavResponse.status, 422);

  const wrongRateWavResponse = await apiRequest(`/api/cases/${created.case.id}/asr`, {
    method: "POST",
    token: created.caseToken,
    headers: { "Content-Type": "audio/wav" },
    body: mutateWavFixture((view) => view.setUint32(24, 44_100, true))
  });
  assert.equal(wrongRateWavResponse.status, 422);

  const missingDataWavResponse = await apiRequest(`/api/cases/${created.case.id}/asr`, {
    method: "POST",
    token: created.caseToken,
    headers: { "Content-Type": "audio/wav" },
    body: mutateWavFixture((_view, bytes) => {
      bytes.set(new TextEncoder().encode("JUNK"), 36);
    })
  });
  assert.equal(missingDataWavResponse.status, 422);

  const forgedLengthWavResponse = await apiRequest(`/api/cases/${created.case.id}/asr`, {
    method: "POST",
    token: created.caseToken,
    headers: { "Content-Type": "audio/wav" },
    body: mutateWavFixture((view) => view.setUint32(4, 36, true))
  });
  assert.equal(forgedLengthWavResponse.status, 422);

  delete env.DASHSCOPE_API_KEY;
  const missingDashScopeKeyResponse = await apiRequest(`/api/cases/${created.case.id}/asr`, {
    method: "POST",
    token: created.caseToken,
    headers: { "Content-Type": "audio/wav" },
    body: validWavFixture()
  });
  assert.equal(missingDashScopeKeyResponse.status, 503);
  assert.equal((await missingDashScopeKeyResponse.json()).code, "DASHSCOPE_NOT_CONFIGURED");

  const retiredInterviewResponse = await apiRequest(`/api/cases/${created.case.id}/interview`, {
    token: created.caseToken
  });
  assert.equal(retiredInterviewResponse.status, 410);
  assert.equal((await retiredInterviewResponse.json()).code, "ASR_PROTOCOL_RETIRED");

  const turnResponse = await apiRequest(`/api/cases/${created.case.id}/turns`, {
    method: "POST",
    token: created.caseToken,
    body: { turnId: "turn-1", transcript: "已经营业，最近主要想先止损" }
  });
  assert.equal(turnResponse.status, 200);
  const turn = await turnResponse.json();
  assert.equal(turn.mode, "deterministic-fallback");
  assert.equal(turn.nextQuestion.complete, false);
  const duplicateTurnResponse = await apiRequest(`/api/cases/${created.case.id}/turns`, {
    method: "POST",
    token: created.caseToken,
    body: { turnId: "turn-1", transcript: "重复提交不应再次处理" }
  });
  assert.equal(duplicateTurnResponse.status, 200);
  assert.equal((await duplicateTurnResponse.json()).duplicate, true);

  const staleTurnResponse = await apiRequest(`/api/cases/${created.case.id}/turns`, {
    method: "POST",
    token: created.caseToken,
    body: {
      turnId: "turn-stale",
      transcript: "这是基于旧问题的迟到回答",
      caseVersion: turn.version - 1
    }
  });
  assert.equal(staleTurnResponse.status, 409);
  assert.equal((await staleTurnResponse.json()).code, "CASE_VERSION_CONFLICT");

  const invalidTurnVersionResponse = await apiRequest(`/api/cases/${created.case.id}/turns`, {
    method: "POST",
    token: created.caseToken,
    body: {
      turnId: "turn-invalid-version",
      transcript: "版本字段格式不对",
      expectedVersion: "not-a-version"
    }
  });
  assert.equal(invalidTurnVersionResponse.status, 422);
  assert.equal((await invalidTurnVersionResponse.json()).code, "CASE_VERSION_INVALID");

  // Regression: when the extraction model times out or errors, the server must
  // commit the deterministic answer and advance to the next question instead of
  // re-serving the one that was just answered.
  env.STEPFUN_API_KEY = "stepfun-test-key";
  stepfunFailuresRemaining = 10;
  const llmFailCaseResponse = await apiRequest("/api/cases", {
    method: "POST",
    body: { stage: "operating" }
  });
  const llmFailCase = await llmFailCaseResponse.json();
  const llmFailLocationResponse = await apiRequest(`/api/cases/${llmFailCase.case.id}/location`, {
    method: "POST",
    token: llmFailCase.caseToken,
    body: {
      confirmed: true,
      context: { location: { address: "上海市黄浦区模型故障测试1号" } }
    }
  });
  const llmFailLocation = await llmFailLocationResponse.json();
  assert.equal(llmFailLocation.firstQuestion.field, "monthlyRevenue");
  const llmFailTurnResponse = await apiRequest(`/api/cases/${llmFailCase.case.id}/turns`, {
    method: "POST",
    token: llmFailCase.caseToken,
    body: {
      turnId: "turn-llm-fail-1",
      transcript: "一个月大约10万元",
      caseVersion: llmFailLocation.version
    }
  });
  assert.equal(llmFailTurnResponse.status, 200);
  const llmFailTurn = await llmFailTurnResponse.json();
  assert.equal(llmFailTurn.mode, "deterministic-fallback");
  assert.ok(llmFailTurn.warning);
  assert.notEqual(llmFailTurn.nextQuestion.field, "monthlyRevenue");
  assert.equal(llmFailTurn.nextQuestion.field, "variableCostRate");
  const preservedRevenue = llmFailTurn.extractedFacts.find((fact) => fact.field === "monthlyRevenue");
  assert.equal(preservedRevenue.value, 100000);
  const llmFailSecondTurnResponse = await apiRequest(`/api/cases/${llmFailCase.case.id}/turns`, {
    method: "POST",
    token: llmFailCase.caseToken,
    body: {
      turnId: "turn-llm-fail-2",
      transcript: "每收一百元大约花45元",
      caseVersion: llmFailTurn.version
    }
  });
  assert.equal(llmFailSecondTurnResponse.status, 200);
  const llmFailSecondTurn = await llmFailSecondTurnResponse.json();
  assert.equal(llmFailSecondTurn.nextQuestion.field, "fixedCostTotal");
  // Once the model recovers, the same deterministic program keeps advancing.
  stepfunFailuresRemaining = 0;
  const recoveredTurnResponse = await apiRequest(`/api/cases/${llmFailCase.case.id}/turns`, {
    method: "POST",
    token: llmFailCase.caseToken,
    body: {
      turnId: "turn-llm-fail-3",
      transcript: "每月固定支出5万元",
      caseVersion: llmFailSecondTurn.version
    }
  });
  assert.equal(recoveredTurnResponse.status, 200);
  const recoveredTurn = await recoveredTurnResponse.json();
  assert.equal(recoveredTurn.mode, "stepfun");
  assert.equal(recoveredTurn.nextQuestion.field, "cashReserve");
  delete env.STEPFUN_API_KEY;

  // Regression: a one-character numeric answer is still a real answer.  In
  // particular, debt = 0 must be stored and advance the deterministic
  // interview instead of producing EMPTY_TRANSCRIPT and trapping the user on
  // the same question.
  const zeroCaseResponse = await apiRequest("/api/cases", {
    method: "POST", body: { stage: "operating" }
  });
  const zeroCase = await zeroCaseResponse.json();
  const zeroLocationResponse = await apiRequest(`/api/cases/${zeroCase.case.id}/location`, {
    method: "POST",
    token: zeroCase.caseToken,
    body: { confirmed: true, context: { location: { address: "上海市黄浦区零值回归测试1号" } } }
  });
  let zeroVersion = (await zeroLocationResponse.json()).version;
  for (const [index, answer] of ["100000", "45", "50000", "30000"].entries()) {
    const response = await apiRequest(`/api/cases/${zeroCase.case.id}/turns`, {
      method: "POST", token: zeroCase.caseToken,
      body: { turnId: `turn-zero-leading-${index}`, transcript: answer, caseVersion: zeroVersion }
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    zeroVersion = payload.version;
  }
  const zeroDebtResponse = await apiRequest(`/api/cases/${zeroCase.case.id}/turns`, {
    method: "POST", token: zeroCase.caseToken,
    body: { turnId: "turn-zero-debt", transcript: "0", caseVersion: zeroVersion }
  });
  assert.equal(zeroDebtResponse.status, 200);
  const zeroDebtTurn = await zeroDebtResponse.json();
  const zeroDebtFact = zeroDebtTurn.extractedFacts.find((fact) => fact.field === "debt");
  assert.equal(zeroDebtFact.value, 0);
  assert.notEqual(zeroDebtTurn.nextQuestion.field, "debt");

  const reviewCorrections = [
    {
      id: "monthlyRevenue",
      field: "monthlyRevenue",
      value: null,
      range: { min: 100000, max: 120000 },
      unit: "元",
      period: "月",
      status: "confirmed",
      source: "typed",
      transcript: "一个月十到十二万"
    },
    {
      id: "cashReserve",
      field: "cashReserve",
      value: null,
      range: null,
      unit: "元",
      status: "unknown",
      source: "choice",
      transcript: "我不知道"
    }
  ];
  const reviewResponse = await apiRequest(`/api/cases/${created.case.id}/review`, {
    method: "POST",
    token: created.caseToken,
    body: {
      caseVersion: turn.version,
      corrections: reviewCorrections
    }
  });
  assert.equal(reviewResponse.status, 200);
  const reviewed = await reviewResponse.json();
  assert.equal(reviewed.version, turn.version + 1);
  const reviewedRevenue = reviewed.facts.find((fact) => fact.id === "monthlyRevenue");
  assert.equal(reviewedRevenue.value, null);
  assert.deepEqual(reviewedRevenue.range, { min: 100000, max: 120000 });
  assert.equal(reviewedRevenue.source, "typed");
  assert.equal(reviewedRevenue.transcript, "一个月十到十二万");
  assert.equal(reviewedRevenue.status, "confirmed");
  assert.equal(reviewedRevenue.evidence, "B");
  const reviewedCash = reviewed.facts.find((fact) => fact.id === "cashReserve");
  assert.equal(reviewedCash.value, null);
  assert.equal(reviewedCash.range, null);
  assert.equal(reviewedCash.status, "unknown");
  assert.equal(reviewedCash.source, "choice");
  assert.equal(reviewedCash.transcript, "我不知道");
  assert.equal(reviewedCash.evidence, "U");

  const staleAnalyzeResponse = await apiRequest(`/api/cases/${created.case.id}/analyze`, {
    method: "POST",
    token: created.caseToken,
    body: { caseVersion: reviewed.version - 1 }
  });
  assert.equal(staleAnalyzeResponse.status, 409);
  const staleAnalyze = await staleAnalyzeResponse.json();
  assert.equal(staleAnalyze.code, "CASE_VERSION_CONFLICT");
  assert.equal(staleAnalyze.version, reviewed.version);
  assert.ok(Array.isArray(staleAnalyze.facts));

  const invalidAnalyzeVersionResponse = await apiRequest(`/api/cases/${created.case.id}/analyze`, {
    method: "POST",
    token: created.caseToken,
    body: { caseVersion: "latest" }
  });
  assert.equal(invalidAnalyzeVersionResponse.status, 422);
  assert.equal((await invalidAnalyzeVersionResponse.json()).code, "CASE_VERSION_INVALID");

  const analyzeResponse = await apiRequest(`/api/cases/${created.case.id}/analyze`, {
    method: "POST",
    token: created.caseToken,
    body: {
      caseVersion: reviewed.version,
      deterministicResult: {
        decision: "TEST",
        title: "先测试",
        reason: "证据不足",
        metrics: { grossMargin: 0.55, runway: 5 }
      }
    }
  });
  assert.equal(analyzeResponse.status, 202);
  const analyze = await analyzeResponse.json();
  assert.match(analyze.runId, /^run_/);

  const runResponse = await apiRequest(
    `/api/cases/${created.case.id}/runs/${analyze.runId}`,
    { token: created.caseToken }
  );
  assert.equal(runResponse.status, 200);
  const run = await runResponse.json();
  assert.equal(run.status, "completed");
  assert.equal(run.result.mode, "deterministic-fallback");
  assert.equal(run.result.top3.length, 0);
  assert.match(run.result.explanation.headline, /先/);
  assert.notEqual(run.result.deterministic.title, "先测试");
  assert.notDeepEqual(run.result.deterministic.metrics, { grossMargin: 0.55, runway: 5 });
  assert.equal("claimToken" in run, false);
  assert.equal("claimedRound" in run, false);
  assert.equal("claimExpiresAt" in run, false);

  const duplicateReviewResponse = await apiRequest(`/api/cases/${created.case.id}/review`, {
    method: "POST",
    token: created.caseToken,
    body: {
      caseVersion: reviewed.version,
      corrections: reviewCorrections
    }
  });
  assert.equal(duplicateReviewResponse.status, 200);
  const duplicateReview = await duplicateReviewResponse.json();
  assert.equal(duplicateReview.unchanged, true);
  assert.equal(duplicateReview.version, reviewed.version);

  const reusedAnalysisResponse = await apiRequest(`/api/cases/${created.case.id}/analyze`, {
    method: "POST",
    token: created.caseToken,
    body: {
      caseVersion: reviewed.version,
      deterministicResult: {
        decision: "TEST",
        title: "不应重复调用",
        reason: "同一版本复用结果",
        metrics: {}
      }
    }
  });
  assert.equal(reusedAnalysisResponse.status, 200);
  const reusedAnalysis = await reusedAnalysisResponse.json();
  assert.equal(reusedAnalysis.runId, analyze.runId);
  assert.equal(reusedAnalysis.reused, true);

  const casCaseResponse = await apiRequest("/api/cases", {
    method: "POST",
    body: { stage: "operating" }
  });
  const casCase = await casCaseResponse.json();
  const casLocationResponse = await apiRequest(`/api/cases/${casCase.case.id}/location`, {
    method: "POST",
    token: casCase.caseToken,
    body: {
      confirmed: true,
      context: { location: { address: "上海市黄浦区并发确认测试1号" } }
    }
  });
  const casLocation = await casLocationResponse.json();
  const concurrentReviews = await Promise.all([
    apiRequest(`/api/cases/${casCase.case.id}/review`, {
      method: "POST",
      token: casCase.caseToken,
      body: {
        caseVersion: casLocation.version,
        corrections: [{
          id: "variableCostRate",
          value: 45,
          unit: "%",
          period: "month",
          status: "confirmed",
          source: "typed",
          transcript: "每收一百元，直接成本四十五元"
        }]
      }
    }),
    apiRequest(`/api/cases/${casCase.case.id}/review`, {
      method: "POST",
      token: casCase.caseToken,
      body: {
        caseVersion: casLocation.version,
        corrections: [{
          id: "fixedCostTotal",
          value: 50_000,
          unit: "元",
          status: "confirmed",
          source: "typed",
          transcript: "每月固定支出五万"
        }]
      }
    })
  ]);
  assert.deepEqual(
    concurrentReviews.map((response) => response.status).sort(),
    [200, 409]
  );
  const winningReviewPayload = await concurrentReviews
    .find((response) => response.status === 200)
    .json();
  const rejectedReviewPayload = await concurrentReviews
    .find((response) => response.status === 409)
    .json();
  assert.equal(rejectedReviewPayload.code, "CASE_VERSION_CONFLICT");
  assert.equal(rejectedReviewPayload.version, winningReviewPayload.version);
  assert.deepEqual(
    rejectedReviewPayload.facts.map((fact) => fact.id).sort(),
    winningReviewPayload.facts.map((fact) => fact.id).sort()
  );
  const committedConcurrentFields = ["variableCostRate", "fixedCostTotal"].filter((id) =>
    winningReviewPayload.facts.some((fact) => fact.id === id)
  );
  assert.equal(committedConcurrentFields.length, 1);

  const ttsFallback = await apiRequest("/api/tts", {
    method: "POST",
    token: created.caseToken,
    body: { caseId: created.case.id, text: "测试语音" }
  });
  assert.equal(ttsFallback.status, 503);

  const ttsWithoutCase = await apiRequest("/api/tts", {
    method: "POST",
    body: { text: "测试语音" }
  });
  assert.equal(ttsWithoutCase.status, 400);

  env.DASHSCOPE_API_KEY = "server-only-key";
  for (let index = 0; index < 40; index += 1) {
    const response = await apiRequest("/api/tts", {
      method: "POST",
      token: created.caseToken,
      body: { caseId: created.case.id, text: `第${index + 1}次播报` }
    });
    assert.equal(response.status, 200, `TTS request ${index + 1} should be allowed`);
    assert.equal(response.headers.get("Content-Type"), "audio/wav");
  }
  const ttsOverQuota = await apiRequest("/api/tts", {
    method: "POST",
    token: created.caseToken,
    body: { caseId: created.case.id, text: "第41次播报" }
  });
  assert.equal(ttsOverQuota.status, 429);
  assert.equal((await ttsOverQuota.json()).code, "TTS_QUOTA_EXCEEDED");

  const policyCaseResponse = await apiRequest("/api/cases", {
    method: "POST",
    body: { stage: "operating" }
  });
  const policyCase = await policyCaseResponse.json();
  const policyLocationResponse = await apiRequest(`/api/cases/${policyCase.case.id}/location`, {
    method: "POST",
    token: policyCase.caseToken,
    body: {
      confirmed: true,
      context: { location: { address: "上海市黄浦区程序控制问题1号" } }
    }
  });
  const policyLocation = await policyLocationResponse.json();
  const committedTurnPromise = apiRequest(`/api/cases/${policyCase.case.id}/turns`, {
    method: "POST",
    token: policyCase.caseToken,
    body: {
      turnId: "turn-policy-a",
      transcript: "我想先止损",
      caseVersion: policyLocation.version
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 2));
  const [rejectedConcurrentTurn, rejectedConcurrentReview, committedPolicyTurn] = await Promise.all([
    apiRequest(`/api/cases/${policyCase.case.id}/turns`, {
      method: "POST",
      token: policyCase.caseToken,
      body: {
        turnId: "turn-policy-b",
        transcript: "我也说一句迟到回答",
        caseVersion: policyLocation.version
      }
    }),
    apiRequest(`/api/cases/${policyCase.case.id}/review`, {
      method: "POST",
      token: policyCase.caseToken,
      body: {
        caseVersion: policyLocation.version,
        corrections: [{
          id: "goal",
          value: "止损",
          status: "confirmed",
          source: "choice"
        }]
      }
    }),
    committedTurnPromise
  ]);
  assert.equal(committedPolicyTurn.status, 200);
  const policyPayload = await committedPolicyTurn.json();
  assert.equal(policyPayload.nextQuestion.field, "variableCostRate");
  assert.equal(rejectedConcurrentTurn.status, 409);
  // Depending on whether the initial turn has released its lock just before
  // the competing request reaches the Worker, a stale request is rejected by
  // the in-progress lock or by the version CAS. Both protect the same fact
  // snapshot and must remain a 409 rather than overwriting the case.
  assert.ok(["TURN_IN_PROGRESS", "CASE_VERSION_CONFLICT"].includes((await rejectedConcurrentTurn.json()).code));
  assert.equal(rejectedConcurrentReview.status, 409);
  assert.ok(["TURN_IN_PROGRESS", "CASE_VERSION_CONFLICT"].includes((await rejectedConcurrentReview.json()).code));
  delete env.STEPFUN_API_KEY;

  const missingPlanResponse = await apiRequest(
    `/api/cases/${created.case.id}/plans/plan_missing/start`,
    { method: "POST", token: created.caseToken, body: {} }
  );
  assert.equal(missingPlanResponse.status, 404);

  const unauthorized = await apiRequest(`/api/cases/${created.case.id}/review`, {
    method: "POST",
    body: { corrections: [{ id: "rent", value: 1000, status: "confirmed" }] }
  });
  assert.equal(unauthorized.status, 403);

  const gate = new AgentGate({}, { STEPFUN_API_KEY: "server-only-key" });
  const gateResponses = await Promise.all(Array.from({ length: 12 }, () => gate.fetch(
    new Request("https://gate.internal/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: "test" }] })
    })
  )));
  assert.ok(gateResponses.every((response) => response.status === 200));
  assert.ok(stepfunMaxActive <= 5, `Durable Object gate exceeded 5: ${stepfunMaxActive}`);

  const durableBuckets = new Map();
  const durableGate = new AgentGate({
    storage: {
      get: async (key) => durableBuckets.get(key),
      put: async (key, value) => durableBuckets.set(key, value)
    }
  }, {});
  const durableRateResults = [];
  for (let index = 0; index < 3; index += 1) {
    const response = await durableGate.fetch(new Request("https://gate.internal/rate", {
      method: "POST",
      body: JSON.stringify({
        action: "analyze",
        key: "a".repeat(64),
        limit: 2,
        windowMs: 60_000
      })
    }));
    durableRateResults.push(await response.json());
  }
  assert.deepEqual(durableRateResults.map((item) => item.allowed), [true, true, false]);
  assert.equal(durableBuckets.size, 1);

  const asrAcquire = async (sessionId) => {
    const response = await durableGate.fetch(new Request("https://gate.internal/asr/acquire", {
      method: "POST",
      body: JSON.stringify({ key: "b".repeat(64), sessionId })
    }));
    return response.json();
  };
  const asrRelease = async (sessionId) => {
    const response = await durableGate.fetch(new Request("https://gate.internal/asr/release", {
      method: "POST",
      body: JSON.stringify({ key: "b".repeat(64), sessionId })
    }));
    return response.json();
  };
  assert.equal((await asrAcquire("asr-one")).allowed, true);
  const concurrentAsr = await asrAcquire("asr-two");
  assert.equal(concurrentAsr.allowed, false);
  assert.equal(concurrentAsr.reason, "active");
  assert.equal((await asrRelease("wrong-session")).released, false);
  assert.equal((await asrRelease("asr-one")).released, true);
  assert.equal((await asrAcquire("asr-two")).allowed, true);
  assert.equal((await asrRelease("asr-two")).released, true);
  assert.equal((await asrAcquire("asr-three")).allowed, true);
  assert.equal((await asrRelease("asr-three")).released, true);
  const asrOverQuota = await asrAcquire("asr-four");
  assert.equal(asrOverQuota.allowed, false);
  assert.equal(asrOverQuota.reason, "session-quota");
  const persistedAsr = durableBuckets.get(`asr:${"b".repeat(64)}`);
  assert.equal(persistedAsr.sessions, 3);
  assert.ok(persistedAsr.reservedBytes >= 3 * 40 * 1024 * 1024);
  assert.ok(persistedAsr.reservedDurationMs >= 3 * 20 * 60 * 1000);

  env.AGENT_GATE = {
    idFromName: () => ({ name: "global" }),
    get: () => ({
      fetch: async () => Response.json({ allowed: false, retryAfterMs: 1000 })
    })
  };
  const durablyRateLimited = await apiRequest("/api/cases", {
    method: "POST",
    headers: { "CF-Connecting-IP": "198.51.100.44" },
    body: { stage: "operating" }
  });
  assert.equal(durablyRateLimited.status, 429);
  assert.equal((await durablyRateLimited.json()).code, "ACTION_RATE_LIMITED");
  delete env.AGENT_GATE;

  const claimState = { token: null, round: null, expiresAt: null };
  const claimDb = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              if (sql.includes("SET claim_token = ?")) {
                const [token, round, expiresAt] = values;
                if (claimState.token && claimState.expiresAt > new Date().toISOString()) {
                  return { meta: { changes: 0 } };
                }
                claimState.token = token;
                claimState.round = round;
                claimState.expiresAt = expiresAt;
                return { meta: { changes: 1 } };
              }
              if (sql.includes("SET claim_token = NULL")) {
                const [, , token, round] = values;
                if (claimState.token !== token || claimState.round !== round) {
                  return { meta: { changes: 0 } };
                }
                claimState.token = null;
                claimState.round = null;
                claimState.expiresAt = null;
                return { meta: { changes: 1 } };
              }
              throw new Error(`unexpected claim SQL: ${sql}`);
            }
          };
        }
      };
    }
  };
  const claimRun = { id: "run_atomic_claim" };
  const simultaneousClaims = await Promise.all([
    claimAnalysisRound({ DB: claimDb }, claimRun, 1, "claim-a"),
    claimAnalysisRound({ DB: claimDb }, claimRun, 1, "claim-b")
  ]);
  assert.equal(simultaneousClaims.filter(Boolean).length, 1);
  const winningClaim = simultaneousClaims.find(Boolean);
  await releaseAnalysisRoundClaim({ DB: claimDb }, claimRun, 1, winningClaim);
  assert.equal(await claimAnalysisRound({ DB: claimDb }, claimRun, 1, "claim-c"), "claim-c");

  const activeClaimRow = {
    id: "run_claimed_delivery",
    case_id: "case_claimed_delivery",
    case_version: 1,
    status: "running",
    progress_json: JSON.stringify({ phase: "round-start" }),
    result_json: "null",
    state_json: JSON.stringify({
      context: {},
      searchState: { round: 0, audited: [], target: 3 }
    }),
    warning: "",
    claim_token: "other-delivery",
    claimed_round: 1,
    claim_expires_at: new Date(Date.now() + 120_000).toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const activeClaimDb = {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              if (sql.includes("SELECT * FROM analysis_runs")) return { ...activeClaimRow };
              return null;
            },
            async run() {
              if (sql.includes("SET claim_token = ?")) return { meta: { changes: 0 } };
              throw new Error(`unexpected active-claim SQL: ${sql}`);
            }
          };
        }
      };
    }
  };
  let claimDeliveryAcked = false;
  let claimDeliveryRetry = null;
  await worker.queue({
    messages: [{
      body: { runId: activeClaimRow.id, round: 1 },
      attempts: 1,
      ack: () => { claimDeliveryAcked = true; },
      retry: (options) => { claimDeliveryRetry = options; }
    }]
  }, { DB: activeClaimDb });
  assert.equal(claimDeliveryAcked, false);
  assert.ok(claimDeliveryRetry.delaySeconds >= 5);
  assert.ok(claimDeliveryRetry.delaySeconds <= 600);

  const queuedRun = {
    id: "run_enqueue_failure",
    caseId: "case_enqueue_failure",
    caseVersion: 1,
    status: "running",
    progress: {},
    result: null,
    context: {},
    searchState: { round: 0, audited: [] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const enqueueFailure = await enqueueAnalysisRound({
    ANALYSIS_QUEUE: { send: async () => { throw new Error("queue unavailable"); } }
  }, queuedRun, 1);
  assert.equal(enqueueFailure.queued, false);
  assert.equal(queuedRun.status, "failed");
  assert.equal(queuedRun.progress.phase, "enqueue-failed");
  assert.match(queuedRun.warning, /queue unavailable/);

  const safeRun = publicRunSnapshot({
    id: "run_public",
    status: "running",
    context: { secret: true },
    searchState: { private: true },
    claimToken: "secret-claim",
    claimedRound: 2,
    claimExpiresAt: "2099-01-01",
    queueClaim: { token: "memory-secret" }
  });
  assert.deepEqual(safeRun, { id: "run_public", status: "running" });

  const poisonRow = {
    id: "run_poison",
    case_id: "case_poison",
    case_version: 1,
    status: "running",
    progress_json: JSON.stringify({ phase: "round-start" }),
    result_json: "null",
    state_json: JSON.stringify({
      context: {},
      searchState: { round: 0, audited: [], target: 3 }
    }),
    warning: "",
    claim_token: "stale-claim",
    claimed_round: 1,
    claim_expires_at: new Date(Date.now() + 60_000).toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const poisonDb = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              if (sql.includes("SELECT * FROM analysis_runs")) return { ...poisonRow };
              return null;
            },
            async run() {
              if (sql.includes("INSERT INTO analysis_runs")) {
                poisonRow.status = values[3];
                poisonRow.progress_json = values[4];
                poisonRow.warning = values[7];
                poisonRow.updated_at = values[9];
                return { meta: { changes: 1 } };
              }
              if (sql.includes("SET claim_token = NULL")) {
                poisonRow.claim_token = null;
                poisonRow.claimed_round = null;
                poisonRow.claim_expires_at = null;
                return { meta: { changes: 1 } };
              }
              throw new Error(`unexpected poison SQL: ${sql}`);
            }
          };
        }
      };
    }
  };
  let retryOptions = null;
  await handleQueueMessageFailure({
    attempts: 3,
    body: { runId: "run_poison", round: 1 },
    retry: (options) => { retryOptions = options; }
  }, { DB: poisonDb }, new Error("poison message"));
  assert.deepEqual(retryOptions, { delaySeconds: 15 });
  assert.equal(poisonRow.status, "running");
  assert.equal(poisonRow.claim_token, "stale-claim");

  await handleQueueMessageFailure({
    attempts: 4,
    body: { runId: "run_poison", round: 1 },
    retry: (options) => { retryOptions = options; }
  }, { DB: poisonDb }, new Error("poison message"));
  assert.equal(poisonRow.status, "failed");
  assert.match(poisonRow.warning, /连续失败/);
  assert.equal(poisonRow.claim_token, null);

  // Mid-round phase transitions must be persisted as they happen so polling
  // clients watch real progress instead of a stale "queued" snapshot.
  const phaseRunRow = {
    id: "run_phase_sink",
    case_id: "case_phase_sink",
    case_version: 1,
    status: "queued",
    progress_json: JSON.stringify({ phase: "queued", round: 1, completed: 0, target: 2 }),
    result_json: "null",
    state_json: JSON.stringify({
      context: { facts: {}, decision: "TEST", title: "测试", reason: "测试", metrics: {} },
      searchState: { round: 0, audited: [], seen: [], rejected: [], verified: [], degradations: [], attempts: 0, target: 2 }
    }),
    warning: "",
    claim_token: null,
    claimed_round: null,
    claim_expires_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const persistedPhases = [];
  const phaseDb = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              if (sql.includes("SELECT * FROM analysis_runs")) return { ...phaseRunRow };
              return null;
            },
            async run() {
              if (sql.includes("INSERT INTO analysis_runs")) {
                phaseRunRow.status = values[3];
                phaseRunRow.progress_json = values[4];
                persistedPhases.push(JSON.parse(values[4] || "{}")?.phase);
                return { meta: { changes: 1 } };
              }
              if (sql.includes("SET claim_token = ?")) return { meta: { changes: 1 } };
              if (sql.includes("SET claim_token = NULL")) return { meta: { changes: 1 } };
              throw new Error(`unexpected phase-sink SQL: ${sql}`);
            }
          };
        }
      };
    }
  };
  let phaseRunAcked = false;
  await worker.queue({
    messages: [{
      body: { runId: phaseRunRow.id, round: 1 },
      attempts: 1,
      ack: () => { phaseRunAcked = true; },
      retry: () => {}
    }]
  }, { DB: phaseDb, STEPFUN_API_KEY: "stepfun-test-key" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(phaseRunAcked, true);
  assert.equal(phaseRunRow.status, "completed");
  for (const phase of ["round-start", "generate", "verify-evidence", "verify-execution", "round-complete", "completed"]) {
    assert.ok(persistedPhases.includes(phase), `phase ${phase} should be persisted mid-run, got: ${persistedPhases.join(",")}`);
  }
  assert.ok(persistedPhases.indexOf("generate") < persistedPhases.lastIndexOf("completed"));

  let scheduledSql = "";
  let scheduledCutoff = "";
  const scheduledResult = await worker.scheduled({}, {
    DB: {
      prepare(sql) {
        scheduledSql = sql;
        return {
          bind(cutoff) {
            scheduledCutoff = cutoff;
            return { run: async () => ({ meta: { changes: 3 } }) };
          }
        };
      }
    }
  }, {});
  assert.match(scheduledSql, /DELETE FROM cases WHERE expires_at <=/);
  assert.match(scheduledCutoff, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(scheduledResult.deleted, 3);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("worker map + DashScope ASR + batch review + deterministic authority + quotas + queue/DLQ guards: all assertions passed");
