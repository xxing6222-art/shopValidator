import assert from "node:assert/strict";
import { StepFunClient } from "./stepfun-client.js";

const apiKey = process.env.STEPFUN_API_KEY || process.env.step_API_KEY;
if (!apiKey) throw new Error("请先设置 STEPFUN_API_KEY 或 step_API_KEY");

const env = {
  STEPFUN_API_KEY: apiKey,
  STEPFUN_BASE_URL: process.env.STEPFUN_BASE_URL,
  STEPFUN_MODEL: process.env.STEPFUN_MODEL || "step-3.7-flash",
  STEPFUN_TTS_MODEL: process.env.STEPFUN_TTS_MODEL || "stepaudio-2.5-tts"
};
const client = new StepFunClient(env);
const result = await client.chatJson([
  {
    role: "system",
    content: '只返回JSON：{"ok":true,"next_question":"string"}'
  },
  {
    role: "user",
    content: "根据餐饮问诊生成一句不超过15字的追问。"
  }
], {
  temperature: 0.1,
  maxTokens: 500,
  requiredKeys: ["ok", "next_question"]
});
assert.equal(result.ok, true);
assert.equal(typeof result.next_question, "string");

const speech = await client.tts("请告诉我，店里一个月大约收多少钱。");
assert.equal(speech.ok, true);
const audio = new Uint8Array(await speech.arrayBuffer());
assert.ok(audio.byteLength > 1000);

console.log(`StepFun live: text=${env.STEPFUN_MODEL}, TTS=${env.STEPFUN_TTS_MODEL}, audio=${audio.byteLength} bytes`);
