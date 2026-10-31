import { httpTest, openAiChat } from './http';
import { AiAdapter } from './types';

function endpoint(baseUrl: string | null, path: string): string {
  if (!baseUrl) throw new Error('Base URL is required for an OpenAI-compatible provider');
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

// Any OpenAI-format chat API (DeepSeek, Together, Fireworks, ...): baseUrl + model.
// Text only, since image support depends on the model behind the URL.
export const openAiCompatibleAdapter: AiAdapter = {
  id: 'OPENAI_COMPATIBLE',
  name: 'OpenAI-compatible',
  supportsPdf: false,
  supportsImage: false,
  defaultModel: '',
  requiresModel: true,
  requiresBaseUrl: true,
  legacyProvider: null,
  usageField: null,
  dailyLimit: null,
  chunkSize: 5000,
  delayMs: 1000,

  call(config, prompt, files = []) {
    if (files.length) throw new Error('OpenAI-compatible adapter does not accept files');
    if (!config.model) throw new Error('Model is required for an OpenAI-compatible provider');
    return openAiChat({
      label: 'OpenAI-compatible',
      url: endpoint(config.baseUrl, '/chat/completions'),
      key: config.key,
      model: config.model,
      prompt,
      maxTokens: 8192,
    });
  },

  test(config) {
    return httpTest(endpoint(config.baseUrl, '/models'), { Authorization: `Bearer ${config.key}` }, config.key);
  },
};
