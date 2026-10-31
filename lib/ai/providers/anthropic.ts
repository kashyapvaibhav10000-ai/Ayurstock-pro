import Anthropic from '@anthropic-ai/sdk';
import { scrubKey } from './http';
import { AiAdapter, AdapterConfig, DEFAULT_TIMEOUT_MS, RateLimitError, TEST_TIMEOUT_MS } from './types';

type ImageMediaType = Anthropic.Base64ImageSource['media_type'];
const IMAGE_TYPES: ImageMediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// The relay does its own fallback, so the SDK should not retry on its own.
function client(config: AdapterConfig, timeout: number) {
  return new Anthropic({ apiKey: config.key, timeout, maxRetries: 0 });
}

function errorText(error: unknown, key: string): string {
  if (error instanceof Anthropic.APIError) return scrubKey(`Anthropic status ${error.status ?? '—'}: ${error.message}`, key).slice(0, 300);
  return scrubKey(error instanceof Error ? error.message : String(error), key).slice(0, 300);
}

// Native Messages API: reads PDFs (document blocks) and images.
export const anthropicAdapter: AiAdapter = {
  id: 'ANTHROPIC',
  name: 'Anthropic Claude',
  supportsPdf: true,
  supportsImage: true,
  defaultModel: 'claude-opus-5-5',
  requiresModel: false,
  requiresBaseUrl: false,
  legacyProvider: null,
  usageField: null,
  dailyLimit: null,
  // Output is the limit, not context: keep each chunk's JSON well under max_tokens.
  chunkSize: 20000,
  delayMs: 1000,

  async call(config, prompt, files = []) {
    const content: Anthropic.ContentBlockParam[] = files.map((file): Anthropic.ContentBlockParam => {
      if (file.mimeType === 'application/pdf') {
        return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data } };
      }
      if (!IMAGE_TYPES.includes(file.mimeType as ImageMediaType)) throw new Error(`Anthropic does not accept ${file.mimeType}`);
      return { type: 'image', source: { type: 'base64', media_type: file.mimeType as ImageMediaType, data: file.data } };
    });
    content.push({ type: 'text', text: prompt.user });

    try {
      const response = await client(config, prompt.timeoutMs ?? DEFAULT_TIMEOUT_MS).messages.create({
        model: config.model || this.defaultModel,
        max_tokens: 16000,
        ...(prompt.system ? { system: prompt.system } : {}),
        messages: [{ role: 'user', content }],
      });
      if (response.stop_reason === 'refusal') throw new Error('Anthropic declined the request');
      const text = response.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('');
      if (!text) throw new Error('Empty response from Anthropic');
      return text;
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) throw new RateLimitError();
      if (error instanceof Anthropic.APIError) throw new Error(errorText(error, config.key));
      throw error;
    }
  },

  async test(config) {
    const started = Date.now();
    try {
      const api = client(config, TEST_TIMEOUT_MS);
      // With a model set, this also checks the model id exists.
      if (config.model) await api.models.retrieve(config.model);
      else await api.models.list({ limit: 1 });
      return { ok: true, latencyMs: Date.now() - started, error: null };
    } catch (error) {
      const timedOut = error instanceof Anthropic.APIConnectionTimeoutError;
      return { ok: false, latencyMs: Date.now() - started, error: timedOut ? 'Timed out after 10s' : errorText(error, config.key) };
    }
  },
};
