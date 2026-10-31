import { httpTest, openAiChat } from './http';
import { AiAdapter, RateLimitError } from './types';

const URL = 'https://api.groq.com/openai/v1/chat/completions';

// Tried in order for images when the instance has no model set.
const VISION_MODELS = ['llama-3.3-70b-versatile', 'meta-llama/llama-4-scout-17b-16e-instruct'];

export const groqAdapter: AiAdapter = {
  id: 'GROQ',
  name: 'Groq',
  supportsPdf: false,
  supportsImage: true,
  defaultModel: 'llama-3.1-8b-instant',
  requiresModel: false,
  requiresBaseUrl: false,
  legacyProvider: 'GROQ',
  usageField: 'groq',
  dailyLimit: 14000,
  chunkSize: 5000, // smaller chunks for 70b model context limits
  delayMs: 3000,

  async call(config, prompt, files = []) {
    if (!files.length) {
      return openAiChat({ label: 'Groq', url: URL, key: config.key, model: config.model || this.defaultModel, prompt, maxTokens: 4096 });
    }

    const models = config.model ? [config.model] : VISION_MODELS;
    let lastError: unknown = null;
    for (const model of models) {
      try {
        console.log(`  🔄 Groq trying ${model}...`);
        return await openAiChat({ label: `Groq ${model}`, url: URL, key: config.key, model, prompt, files, maxTokens: 4096 });
      } catch (err) {
        if (err instanceof RateLimitError) throw err;
        console.warn(`  ⚠️ ${err instanceof Error ? err.message : String(err)}`);
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('All Groq vision models failed');
  },

  test(config) {
    return httpTest('https://api.groq.com/openai/v1/models', { Authorization: `Bearer ${config.key}` }, config.key);
  },
};
