import { AiProvider } from '@prisma/client';
import { anthropicAdapter } from './anthropic';
import { geminiAdapter } from './gemini';
import { groqAdapter } from './groq';
import { mistralAdapter } from './mistral';
import { openAiCompatibleAdapter } from './openai-compatible';
import { openRouterAdapter } from './openrouter';
import { AdapterId, AiAdapter } from './types';

export * from './types';

/** Registry of API formats, in "Add provider" display order. */
export const AI_ADAPTERS: AiAdapter[] = [
  geminiAdapter,
  anthropicAdapter,
  groqAdapter,
  mistralAdapter,
  openRouterAdapter,
  openAiCompatibleAdapter,
];

const BY_ID = new Map(AI_ADAPTERS.map((adapter) => [adapter.id, adapter]));

export function getAdapter(id: string): AiAdapter | null {
  return BY_ID.get(id as AdapterId) ?? null;
}

/** Adapter for one of the four original providers. */
export function legacyAdapter(provider: AiProvider): AiAdapter {
  return BY_ID.get(provider)!;
}

/** Public, key-free description of an adapter for the settings UI. */
export function describeAdapter(adapter: AiAdapter) {
  return {
    id: adapter.id,
    name: adapter.name,
    supportsPdf: adapter.supportsPdf,
    supportsImage: adapter.supportsImage,
    defaultModel: adapter.defaultModel,
    requiresModel: adapter.requiresModel,
    requiresBaseUrl: adapter.requiresBaseUrl,
    envFallback: adapter.legacyProvider !== null,
  };
}
