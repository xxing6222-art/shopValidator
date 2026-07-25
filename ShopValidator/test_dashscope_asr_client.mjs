import assert from "node:assert/strict";
import {
  DashScopeAsrClient,
  extractDashScopeTranscript
} from "./dashscope-asr-client.js";

assert.equal(
  extractDashScopeTranscript({ output: { text: "Hello World，这里是阿里巴巴语音实验室。" } }),
  "Hello World，这里是阿里巴巴语音实验室。"
);
assert.equal(
  extractDashScopeTranscript({ output: { output: { sentence: { text: "嵌套文本" } } } }),
  "嵌套文本"
);

let captured;
const client = new DashScopeAsrClient(
  {
    DASHSCOPE_API_KEY: "dashscope-test-key",
    DASHSCOPE_ASR_URL: "https://dashscope.example/asr",
    DASHSCOPE_ASR_MODEL: "fun-asr-flash-2026-06-15"
  },
  {
    fetch: async (url, options) => {
      captured = { url, options, body: JSON.parse(options.body) };
      return Response.json({
        output: { text: "一个月营业额大约十二万元。" },
        request_id: "request-test"
      });
    }
  }
);

const wav = new ArrayBuffer(48);
new Uint8Array(wav).set(new TextEncoder().encode("RIFF"));
const result = await client.transcribe(wav, {
  context: "营业额、毛利率、房租、客单价"
});
assert.equal(result.text, "一个月营业额大约十二万元。");
assert.equal(result.requestId, "request-test");
assert.equal(captured.url, "https://dashscope.example/asr");
assert.equal(captured.options.headers.Authorization, "Bearer dashscope-test-key");
assert.equal(captured.options.headers["X-DashScope-SSE"], "disable");
assert.equal(captured.body.model, "fun-asr-flash-2026-06-15");
assert.equal(captured.body.parameters.format, "wav");
assert.equal(captured.body.parameters.sample_rate, "16000");
assert.match(
  captured.body.input.messages.at(-1).content[0].input_audio.data,
  /^data:audio\/wav;base64,/
);
assert.match(captured.body.input.messages[0].content[0].text, /毛利率/);

const nestedClient = new DashScopeAsrClient(
  { DASHSCOPE_API_KEY: "test" },
  {
    fetch: async () => Response.json({
      output: { output: { sentence: { text: "嵌套响应也能解析" } } }
    })
  }
);
assert.equal((await nestedClient.transcribe(wav)).text, "嵌套响应也能解析");

const failingClient = new DashScopeAsrClient(
  { DASHSCOPE_API_KEY: "test" },
  {
    fetch: async () => Response.json(
      { code: "InvalidApiKey", message: "bad key" },
      { status: 401 }
    )
  }
);
await assert.rejects(() => failingClient.transcribe(wav), /401: bad key/);

console.log("DashScope ASR client: 12 assertions passed");
