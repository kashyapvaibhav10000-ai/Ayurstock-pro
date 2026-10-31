import { fetchWithTimeout, httpTest, openAiChat } from './http';
import { AiAdapter, RateLimitError } from './types';

const URL = 'https://openrouter.ai/api/v1/chat/completions';

// Free text models probed in order when the instance has no model set.
const TEXT_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  'google/gemma-3-27b-it:free',
  'google/gemini-2.0-flash-lite-preview-02-05:free',
  'deepseek/deepseek-r1-distill-llama-70b:free',
];

const VISION_MODELS = [
  'google/gemini-2.0-flash-001',
  'google/gemini-2.0-flash-lite-001',
  'anthropic/claude-3.5-sonnet:beta',
  'google/gemma-3-27b-it:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
];

// The probe costs one request per model, so remember the answer briefly.
const PROBE_TTL_MS = 5 * 60_000;
let probed: { model: string; at: number } | null = null;

async function findWorkingModel(key: string): Promise<string> {
  if (probed && Date.now() - probed.at < PROBE_TTL_MS) return probed.model;
  console.log('🔍 Finding working OpenRouter model...');
  for (const model of TEXT_MODELS) {
    try {
      const resp = await fetchWithTimeout(
        URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'Reply with the single word: Working' }],
            temperature: 0,
            max_tokens: 5,
          }),
        },
        5000
      );
      const data = await resp.json().catch(() => null);
      if (data?.error) { console.log(`  ❌ ${model}: ${(data.error.message || '').substring(0, 80)}`); continue; }
      if (data?.choices?.[0]?.message?.content) {
        console.log(`  ✅ ${model}: working!`);
        probed = { model, at: Date.now() };
        return model;
      }
      console.log(`  ❌ ${model}: empty response`);
    } catch {
      console.log(`  ❌ ${model}: timeout or error`);
    }
  }
  throw new Error('No OpenRouter models are currently available.');
}

export const openRouterAdapter: AiAdapter = {
  id: 'OPENROUTER',
  name: 'OpenRouter',
  supportsPdf: false,
  supportsImage: true,
  defaultModel: 'auto (free models)',
  requiresModel: false,
  requiresBaseUrl: false,
  legacyProvider: 'OPENROUTER',
  usageField: 'openrouter',
  dailyLimit: null,
  chunkSize: 3500,
  delayMs: 1000,

  async call(config, prompt, files = []) {
    if (!files.length) {
      const model = config.model || (await findWorkingModel(config.key));
      return openAiChat({ label: 'OpenRouter', url: URL, key: config.key, model, prompt, maxTokens: 4096 });
    }

    const models = config.model ? [config.model] : VISION_MODELS;
    let lastError: unknown = null;
    for (const model of models) {
      try {
        console.log(`  🔄 OpenRouter trying ${model}...`);
        return await openAiChat({ label: `OpenRouter ${model}`, url: URL, key: config.key, model, prompt, files, maxTokens: 4096 });
      } catch (err) {
        // A rate-limited model does not mean the next one is.
        console.warn(`  ⚠️ ${model}: ${err instanceof RateLimitError ? 'rate limited' : err instanceof Error ? err.message : String(err)}`);
        lastError = err;
      }
    }
    throw lastError instanceof Error && !(lastError instanceof RateLimitError)
      ? lastError
      : new Error('All OpenRouter vision models failed');
  },

  test(config) {
    return httpTest('https://openrouter.ai/api/v1/key', { Authorization: `Bearer ${config.key}` }, config.key);
  },
};
