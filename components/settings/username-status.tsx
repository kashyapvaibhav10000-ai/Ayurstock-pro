import { UsernameStatus } from '@/hooks/use-username-availability';
import { USERNAME_HINT } from '@/lib/username';

/** One-line hint under a username input: rules, checking, available or taken. */
export default function UsernameStatusLine({ status }: { status: UsernameStatus }) {
  if (status.state === 'idle') return <p className="text-[10px] text-muted-foreground">{USERNAME_HINT}</p>;
  if (status.state === 'checking') return <p className="text-[10px] text-muted-foreground">Checking availability…</p>;
  const ok = status.state === 'available';
  return <p className={`text-[10px] ${ok ? 'text-green-600' : 'text-red-500'}`}>{status.message}</p>;
}
