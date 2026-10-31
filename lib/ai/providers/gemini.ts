import { fetchWithTimeout, httpTest, scrubKey } from './http';
import { AiAdapter, DEFAULT_TIMEOUT_MS, RateLimitError } from './types';

// Native generateContent API: reads PDFs and images inline.
export const geminiAdapter: AiAdapter = {
  id: 'GEMINI',
  name: 'Google Gemini',
  supportsPdf: true,
  supportsImage: true,
  defaultModel: 'gemini-2.0-flash',
  requiresModel: false,
  requiresBaseUrl: false,
  legacyProvider: 'GEMINI',
  usageField: 'gemini',
  dailyLimit: 1400,
  chunkSize: 500000, // always 1 chunk — Gemini has 1M token context
  delayMs: 1000,

  async call(config, prompt, files = []) {
    const model = config.model || this.defaultModel;
    // System and user text go in one part, as the parser always sent them.
    const text = prompt.system ? `${prompt.system}\n\n${prompt.user}` : prompt.user;
    const resp = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.key },
        body: JSON.stringify({
          contents: [{ parts: [...files.map((file) => ({ inlineData: { mimeType: file.mimeType, data: file.data } })), { text }] }],
          generationConfig: { temperature: 0 },
        }),
      },
      prompt.timeoutMs ?? DEFAULT_TIMEOUT_MS
    );

    if (resp.status === 429) throw new RateLimitError();
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(scrubKey(`Gemini status ${resp.status}${body ? `: ${body.substring(0, 200)}` : ''}`, config.key));
    }
    const data = await resp.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('Empty response from Gemini');
    return content;
  },

  test(config) {
    return httpTest('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { 'x-goog-api-key': config.key }, config.key);
  },
};
