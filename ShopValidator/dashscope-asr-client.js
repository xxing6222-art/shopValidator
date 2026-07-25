const DEFAULT_ASR_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const DEFAULT_ASR_MODEL = "fun-asr-flash-2026-06-15";

function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function extractDashScopeTranscript(payload) {
  return String(
    payload?.output?.text
    || payload?.output?.output?.sentence?.text
    || ""
  ).trim();
}

export class DashScopeAsrClient {
  constructor(env = {}, options = {}) {
    this.apiKey = String(env.DASHSCOPE_API_KEY || "").trim();
    this.url = String(env.DASHSCOPE_ASR_URL || DEFAULT_ASR_URL).trim();
    this.model = String(env.DASHSCOPE_ASR_MODEL || DEFAULT_ASR_MODEL).trim();
    this.fetch = options.fetch
      ? (...args) => options.fetch(...args)
      : (...args) => globalThis.fetch(...args);
  }

  get configured() {
    return Boolean(this.apiKey);
  }

  async transcribe(audioBuffer, options = {}) {
    if (!this.configured) throw new Error("DASHSCOPE_API_KEY 未配置");
    if (!(audioBuffer instanceof ArrayBuffer) || !audioBuffer.byteLength) {
      throw new Error("语音片段为空");
    }

    const context = String(options.context || "").trim().slice(0, 380);
    const messages = [];
    if (context) {
      messages.push({
        role: "user",
        content: [{ type: "input_text", text: context }]
      });
    }
    messages.push({
      role: "user",
      content: [{
        type: "input_audio",
        input_audio: {
          data: `data:audio/wav;base64,${bytesToBase64(audioBuffer)}`
        }
      }]
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || 25_000);
    try {
      const response = await this.fetch(this.url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "X-DashScope-SSE": "disable"
        },
        body: JSON.stringify({
          model: this.model,
          input: { messages },
          parameters: { format: "wav", sample_rate: "16000" }
        }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = String(payload?.message || payload?.code || response.statusText || "unknown").slice(0, 300);
        throw new Error(`DashScope ASR 请求失败 ${response.status}: ${detail}`);
      }
      const text = extractDashScopeTranscript(payload);
      if (!text) throw new Error("DashScope ASR 未返回转写文本");
      return {
        text,
        requestId: String(payload?.request_id || payload?.requestId || ""),
        model: this.model
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export const dashScopeAsrDefaults = {
  url: DEFAULT_ASR_URL,
  model: DEFAULT_ASR_MODEL
};
