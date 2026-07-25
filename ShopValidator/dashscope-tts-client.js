const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const DEFAULT_MODEL = "qwen3-tts-instruct-flash";
const DEFAULT_VOICE = "Serena";
const DEFAULT_INSTRUCTIONS = "温柔、自然、有专业感的年轻女声；普通话清晰；中等偏慢语速；像一位可信赖的产品助手。";

function timeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function bytesFromBase64(value) {
  const source = String(value || "").replace(/^data:[^,]+,/, "").replace(/\s/g, "");
  if (!source) throw new Error("DashScope TTS 没有返回音频数据");
  const binary = atob(source);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function audioContentType(format) {
  const normalized = String(format || "wav").trim().toLowerCase();
  if (normalized === "mp3" || normalized === "mpeg") return "audio/mpeg";
  if (normalized === "opus") return "audio/ogg; codecs=opus";
  if (normalized === "pcm") return "audio/pcm";
  return "audio/wav";
}

export class DashScopeTtsClient {
  constructor(env = {}, options = {}) {
    this.apiKey = String(env.DASHSCOPE_API_KEY || "").trim();
    this.baseUrl = String(env.DASHSCOPE_TTS_URL || DEFAULT_BASE_URL).trim();
    this.model = String(env.DASHSCOPE_TTS_MODEL || DEFAULT_MODEL).trim();
    this.voice = String(env.DASHSCOPE_TTS_VOICE || DEFAULT_VOICE).trim();
    this.instructions = String(env.DASHSCOPE_TTS_INSTRUCTIONS || DEFAULT_INSTRUCTIONS).trim();
    this.fetch = options.fetch
      ? (...args) => options.fetch(...args)
      : (...args) => globalThis.fetch(...args);
  }

  get configured() {
    return Boolean(this.apiKey && this.baseUrl && this.model);
  }

  async synthesize(input, options = {}) {
    if (!this.configured) throw new Error("DASHSCOPE_API_KEY 未配置");
    const text = String(input || "").trim();
    if (!text || text.length > 500) throw new Error("TTS 文本长度必须为 1—500 字");
    const timeout = timeoutSignal(options.timeoutMs || 20_000);
    try {
      const response = await this.fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          input: {
            text,
            voice: options.voice || this.voice,
            language_type: "Chinese",
            instructions: options.instructions || this.instructions,
            optimize_instructions: true
          }
        }),
        signal: timeout.signal
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 400);
        throw new Error(`DashScope TTS 请求失败 ${response.status}: ${detail}`);
      }
      const payload = await response.json();
      const audio = payload?.output?.audio || {};
      if (audio.data) {
        return { body: bytesFromBase64(audio.data), contentType: audioContentType(audio.format) };
      }
      if (audio.url) {
        const audioResponse = await this.fetch(audio.url, { headers: { "Accept": "audio/*" }, signal: timeout.signal });
        if (!audioResponse.ok) throw new Error(`DashScope TTS 音频下载失败 ${audioResponse.status}`);
        return {
          body: await audioResponse.arrayBuffer(),
          contentType: audioResponse.headers.get("Content-Type") || audioContentType(audio.format)
        };
      }
      throw new Error("DashScope TTS 响应没有可播放音频");
    } finally {
      timeout.clear();
    }
  }
}

export const dashScopeTtsDefaults = {
  baseUrl: DEFAULT_BASE_URL,
  model: DEFAULT_MODEL,
  voice: DEFAULT_VOICE,
  instructions: DEFAULT_INSTRUCTIONS
};
