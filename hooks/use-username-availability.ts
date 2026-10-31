'use client';

import { useEffect, useState } from 'react';
import { normalizeUsername, usernameError } from '@/lib/username';

export type UsernameStatus =
  | { state: 'idle' }
  | { state: 'invalid'; message: string }
  | { state: 'checking' }
  | { state: 'available'; message: string }
  | { state: 'taken'; message: string }
  | { state: 'error'; message: string };

/**
 * Live availability of a username as the user types (debounced).
 * initial = the username already saved for this user (counts as unchanged).
 * userId = the user being edited, when an admin edits someone else.
 */
export function useUsernameAvailability(value: string, initial: string | null | undefined, userId?: string): UsernameStatus {
  const [status, setStatus] = useState<UsernameStatus>({ state: 'idle' });
  const username = normalizeUsername(value);

  useEffect(() => {
    if (!username || username === (initial ?? '')) {
      setStatus({ state: 'idle' });
      return;
    }
    const error = usernameError(username);
    if (error) {
      setStatus({ state: 'invalid', message: error });
      return;
    }

    setStatus({ state: 'checking' });
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ username });
        if (userId) params.set('userId', userId);
        const res = await fetch(`/api/users/username-available?${params}`, { signal: controller.signal });
        const data = await res.json();
        if (!data.success) setStatus({ state: 'error', message: data.message || 'Could not check username.' });
        else if (data.available) setStatus({ state: 'available', message: data.message });
        else setStatus({ state: data.valid ? 'taken' : 'invalid', message: data.message });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setStatus({ state: 'error', message: 'Could not check username.' });
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [username, initial, userId]);

  return status;
}

/** True when the form must not be submitted with this username. */
export function usernameBlocked(status: UsernameStatus): boolean {
  return status.state === 'invalid' || status.state === 'taken' || status.state === 'checking';
}
