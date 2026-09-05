const DEFAULT_BASE = 'http://localhost:11434';
const DEFAULT_MODEL = 'huihui_ai/Qwen3.8-abliterated';

// 提示词：要求模型输出「一句话」，且这句话本身可直接作为图像生成模型的 prompt
const PROMPT =
  '请用一句流畅的中文描述这张图片，使其可以直接作为图像生成模型的提示词（prompt）。' +
  '要求：只输出这一句话本身，不要任何解释、不要序号、不要分点、不要用引号包裹、不要多余标点；' +
  '句子需涵盖画面主体、关键细节（颜色/动作/文字/构图）与整体风格，信息密度高，可直接用于图像生成。';

/** 探测 Ollama 服务是否可用，可用则返回模型列表 */
async function checkOllama({ baseUrl = DEFAULT_BASE, timeoutMs = 3000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.models || [];
  } finally {
    clearTimeout(t);
  }
}

/**
 * 对单张图片（JPEG Buffer）做内容反推，返回一句话描述（可直接用作生成 prompt）。
 */
async function describeImage(jpegBuffer, {
  baseUrl = DEFAULT_BASE,
  model = DEFAULT_MODEL,
  prompt = PROMPT,
  timeoutMs = 180000,
} = {}) {
  const b64 = jpegBuffer.toString('base64');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, images: [b64], stream: false }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    const json = await res.json();
    let out = (json.response || '').trim();
    if (!out) throw new Error('Ollama 返回为空');
    // 兜底清理：去掉模型可能带出的引号包裹 / 行内序号 / 多余空白
    out = out
      .replace(/^[「『"'\s]+|[」』"'\s]+$/g, '')
      .replace(/^\s*(?:\d+[.、)]\s*)+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    return out;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`Ollama 超时（${timeoutMs}ms）`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

module.exports = { checkOllama, describeImage, DEFAULT_BASE, DEFAULT_MODEL, PROMPT };
