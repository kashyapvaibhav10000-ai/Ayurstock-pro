import { httpTest, openAiChat } from './http';
import { AiAdapter } from './types';

export const mistralAdapter: AiAdapter = {
  id: 'MISTRAL',
  name: 'Mistral',
  supportsPdf: false,
  // Never used for images by the parser; kept text-only.
  supportsImage: false,
  defaultModel: 'mistral-small-latest',
  requiresModel: false,
  requiresBaseUrl: false,
  legacyProvider: 'MISTRAL',
  usageField: 'mistral',
  dailyLimit: 1000,
  chunkSize: 5000,
  delayMs: 1000,

  call(config, prompt, files = []) {
    if (files.length) throw new Error('Mistral adapter does not accept files');
    return openAiChat({
      label: 'Mistral',
      url: 'https://api.mistral.ai/v1/chat/completions',
      key: config.key,
      model: config.model || this.defaultModel,
      prompt,
      maxTokens: 8192,
    });
  },

  test(config) {
    return httpTest('https://api.mistral.ai/v1/models', { Authorization: `Bearer ${config.key}` }, config.key);
  },
};
