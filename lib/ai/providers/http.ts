import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'dns';
import { Agent, fetch as undiciFetch } from 'undici';
import { assertPublicHttpsUrl, isPrivateAddress, UnsafeUrlError } from '@/lib/net-guard';
import { AiFile, AiPrompt, DEFAULT_TIMEOUT_MS, RateLimitError, TEST_TIMEOUT_MS, TestResult } from './types';

/**
 * fetch with an abort timeout. Every request carries an API key and some
 * URLs are admin-configured, so the target must be public https and
 * redirects are never followed (a 3xx comes back as a failed response).
 */
type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * DNS lookup used for the actual connection. assertPublicHttpsUrl checks the
 * name first, but fetch would resolve it again; a rebinding answer in between
 * could reach a private address. Checking here, on the addresses the socket
 * will use, closes that window.
 */
function publicOnlyLookup(hostname: string, options: LookupOptions, callback: LookupCallback) {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, '');
    const list = addresses as LookupAddress[];
    if (list.length === 0 || list.some((entry) => isPrivateAddress(entry.address))) {
      return callback(new UnsafeUrlError('URL points to a private address'), '');
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

const publicOnlyAgent = new Agent({ connect: { lookup: publicOnlyLookup as never } });

export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  await assertPublicHttpsUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await undiciFetch(url, {
      ...(init as Parameters<typeof undiciFetch>[1]),
      redirect: 'manual',
      signal: controller.signal,
      dispatcher: publicOnlyAgent,
    });
    return response as unknown as Response;
  } finally {
    clearTimeout(timer);
  }
}

/** Remove the key from any text that may be shown or stored. */
export function scrubKey(text: string, key: string): string {
  return key ? text.split(key).join('[redacted]') : text;
}

/**
 * One chat completion against an OpenAI-format endpoint (Groq, Mistral,
 * OpenRouter, any OpenAI-compatible API). Images go in as image_url parts.
 */
export async function openAiChat(options: {
  label: string;
  url: string;
  key: string;
  model: string;
  prompt: AiPrompt;
  files?: AiFile[];
  maxTokens: number;
  temperature?: number;
  extraHeaders?: Record<string, string>;
}): Promise<string> {
  const { label, url, key, model, prompt, files = [], maxTokens } = options;
  const messages: Array<{ role: string; content: unknown }> = [];
  if (prompt.system) messages.push({ role: 'system', content: prompt.system });
  messages.push({
    role: 'user',
    content: files.length
      ? [
          ...files.map((file) => ({ type: 'image_url', image_url: { url: `data:${file.mimeType};base64,${file.data}` } })),
          { type: 'text', text: prompt.user },
        ]
      : prompt.user,
  });

  const resp = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...options.extraHeaders },
      body: JSON.stringify({ model, messages, temperature: options.temperature ?? 0, max_tokens: maxTokens }),
    },
    prompt.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  if (resp.status === 429) throw new RateLimitError();
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(scrubKey(`${label} status ${resp.status}${body ? `: ${body.substring(0, 200)}` : ''}`, key));
  }
  const data = await resp.json();
  if (data?.error) throw new Error(scrubKey(`${label}: ${String(data.error.message || data.error).substring(0, 200)}`, key));
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`Empty response from ${label}`);
  return content;
}

/** Authenticated GET used as a key test. Error text is scrubbed of the key. */
export async function httpTest(url: string, headers: Record<string, string>, key: string): Promise<TestResult> {
  const scrub = (text: string) => scrubKey(text, key).slice(0, 300);
  const started = Date.now();
  try {
    const res = await fetchWithTimeout(url, { headers, cache: 'no-store' }, TEST_TIMEOUT_MS);
    const latencyMs = Date.now() - started;
    if (res.ok) return { ok: true, latencyMs, error: null };
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      const detail = body?.error?.message || body?.message || body?.detail;
      if (detail) message += `: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
    } catch {
      // non-JSON error body; status is enough
    }
    return { ok: false, latencyMs, error: scrub(message) };
  } catch (error) {
    const latencyMs = Date.now() - started;
    const aborted = error instanceof Error && error.name === 'AbortError';
    return { ok: false, latencyMs, error: aborted ? 'Timed out after 10s' : scrub(error instanceof Error ? error.message : 'Request failed') };
  }
}
