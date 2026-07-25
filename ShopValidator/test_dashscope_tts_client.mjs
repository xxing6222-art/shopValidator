import assert from "node:assert/strict";
import { DashScopeTtsClient, dashScopeTtsDefaults } from "./dashscope-tts-client.js";

let captured = null;
const client = new DashScopeTtsClient({ DASHSCOPE_API_KEY: "server-secret" }, {
  fetch: async (url, init = {}) => {
    captured = { url, init };
    return Response.json({
      output: { audio: { data: Buffer.from("RIFFdemo-wav").toString("base64"), format: "wav" } }
    });
  }
});

const output = await client.synthesize("你好，欢迎使用店判。");
assert.equal(captured.url, dashScopeTtsDefaults.baseUrl);
assert.equal(captured.init.headers.Authorization, "Bearer server-secret");
const payload = JSON.parse(captured.init.body);
assert.equal(payload.model, "qwen3-tts-instruct-flash");
assert.equal(payload.input.voice, "Serena");
assert.equal(payload.input.language_type, "Chinese");
assert.equal(payload.input.optimize_instructions, true);
assert.match(payload.input.instructions, /温柔、自然/);
assert.equal(output.contentType, "audio/wav");
assert.equal(new TextDecoder().decode(output.body), "RIFFdemo-wav");

const noKey = new DashScopeTtsClient({}, { fetch: async () => Response.json({}) });
await assert.rejects(() => noKey.synthesize("测试"), /DASHSCOPE_API_KEY/);
await assert.rejects(() => client.synthesize(""), /1—500/);

console.log("DashScope TTS client: request, audio decode and validation passed");
