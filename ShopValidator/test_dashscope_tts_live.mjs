import assert from "node:assert/strict";
import { DashScopeTtsClient } from "./dashscope-tts-client.js";

const client = new DashScopeTtsClient({ DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY });
const audio = await client.synthesize("你好，欢迎使用店判。", { timeoutMs: 30_000 });
assert.ok(audio.body.byteLength > 64, "DashScope TTS should return playable audio bytes");
assert.match(audio.contentType, /^audio\//);
console.log(`DashScope TTS live: ${audio.contentType}, ${audio.body.byteLength} bytes`);
