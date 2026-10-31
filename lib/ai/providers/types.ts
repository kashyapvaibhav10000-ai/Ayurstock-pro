import { AiProvider } from '@prisma/client';

/** API formats the parser can talk to. Stored as AiProviderKey.adapter. */
export type AdapterId = 'GEMINI' | 'GROQ' | 'MISTRAL' | 'OPENROUTER' | 'ANTHROPIC' | 'OPENAI_COMPATIBLE';

export interface AiFile {
  mimeType: string;
  /** base64, no data: prefix */
  data: string;
}

export interface AiPrompt {
  system?: string;
  user: string;
  timeoutMs?: number;
}

/** Per-instance settings. model null = the adapter's built-in defaults. */
export interface AdapterConfig {
  key: string;
  model: string | null;
  baseUrl: string | null;
}

export interface TestResult {
  ok: boolean;
  latencyMs: number;
  error: string | null;
}

export interface AiAdapter {
  id: AdapterId;
  name: string;
  supportsPdf: boolean;
  supportsImage: boolean;
  /** Shown as the model placeholder; what call() uses when model is null. */
  defaultModel: string;
  /** Model must be set (no built-in default). */
  requiresModel: boolean;
  requiresBaseUrl: boolean;
  /** Original provider whose .env key this adapter can fall back to. */
  legacyProvider: AiProvider | null;
  /** ApiUsageCounter column for the legacy daily counter. */
  usageField: 'gemini' | 'groq' | 'mistral' | 'openrouter' | null;
  dailyLimit: number | null;
  /** Characters of document text per request in the text relay. */
  chunkSize: number;
  /** Pause between chunk requests. */
  delayMs: number;
  /** Returns the model's raw text. Throws RateLimitError on 429. */
  call(config: AdapterConfig, prompt: AiPrompt, files?: AiFile[]): Promise<string>;
  /** Minimal authenticated call (model/key listing). */
  test(config: AdapterConfig): Promise<TestResult>;
}

export class RateLimitError extends Error {
  status = 429;
  constructor() {
    super('RATE_LIMIT');
  }
}

export const DEFAULT_TIMEOUT_MS = 90_000;
export const TEST_TIMEOUT_MS = 10_000;
