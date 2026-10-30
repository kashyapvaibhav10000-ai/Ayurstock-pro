'use client';

import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, GripVertical, KeyRound, Loader2, ShieldAlert, Trash2, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import AiUsageTab from '@/components/settings/ai-usage-tab';
import { cn } from '@/lib/utils';

type Provider = 'GEMINI' | 'GROQ' | 'MISTRAL' | 'OPENROUTER';

const PROVIDER_LABEL: Record<Provider, string> = {
  GEMINI: 'Google Gemini',
  GROQ: 'Groq',
  MISTRAL: 'Mistral',
  OPENROUTER: 'OpenRouter',
};

// Key in ApiUsageCounter for today's call count.
const USAGE_FIELD: Record<Provider, string> = {
  GEMINI: 'gemini',
  GROQ: 'groq',
  MISTRAL: 'mistral',
  OPENROUTER: 'openrouter',
};

interface ProviderCard {
  provider: Provider;
  priority: number;
  hasDbKey: boolean;
  last4: string | null;
  enabled: boolean;
  envKeyPresent: boolean;
  activeSource: 'db' | 'env' | null;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastLatencyMs: number | null;
  lastError: string | null;
}

interface AuditEntry {
  id: string;
  provider: Provider;
  action: string;
  detail: string | null;
  userEmail: string | null;
  createdAt: string;
}

interface AiState {
  vaultConfigured: boolean;
  providers: ProviderCard[];
  auditLog: AuditEntry[];
}

function statusOf(card: ProviderCard): { dot: string; text: string } {
  if (!card.activeSource) return { dot: 'bg-muted-foreground/40', text: card.hasDbKey && !card.enabled ? 'Disabled' : 'No key' };
  if (card.lastTestOk === false) return { dot: 'bg-danger', text: 'Last test failed' };
  if (card.lastTestOk === true) return { dot: 'bg-success', text: 'Working' };
  return { dot: 'bg-warning', text: 'Not tested' };
}

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) ? error.response?.data?.message || fallback : fallback;
}

function ProviderKeyCard({
  card,
  position,
  total,
  usageToday,
  busy,
  onAction,
  onMove,
  dragProps,
  dragOver,
}: {
  card: ProviderCard;
  position: number;
  total: number;
  usageToday: number | null;
  busy: boolean;
  onAction: (fn: () => Promise<{ data: { data: AiState } }>, success: string) => Promise<boolean>;
  onMove: (delta: -1 | 1) => void;
  dragProps: React.HTMLAttributes<HTMLDivElement> & { draggable: boolean };
  dragOver: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const status = statusOf(card);

  const saveKey = async () => {
    const ok = await onAction(
      () => axios.post('/api/admin/ai-keys', { provider: card.provider, key: keyInput.trim() }),
      `${PROVIDER_LABEL[card.provider]} key saved`
    );
    // The plaintext is dropped from state either way; it is never shown again.
    setKeyInput('');
    if (ok) setEditing(false);
  };

  return (
    <div
      {...dragProps}
      className={cn(
        'rounded-2xl border bg-background p-5 space-y-4 transition-colors',
        dragOver ? 'border-primary ring-2 ring-primary/20' : 'border-border'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="cursor-grab text-muted-foreground hover:text-foreground" title="Drag to change fallback order">
            <GripVertical className="h-5 w-5" />
          </span>
          <span className="h-7 w-7 shrink-0 rounded-full bg-primary/10 text-primary text-xs font-black flex items-center justify-center">
            {position + 1}
          </span>
          <div className="min-w-0">
            <div className="text-[15px] font-black text-foreground">{PROVIDER_LABEL[card.provider]}</div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
              <span className={cn('h-2 w-2 rounded-full', status.dot)} />
              {status.text}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={position === 0 || busy} onClick={() => onMove(-1)} aria-label="Move up">
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={position === total - 1 || busy} onClick={() => onMove(1)} aria-label="Move down">
            <ArrowDown className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <dt className="font-bold text-muted-foreground">Key</dt>
        <dd className="font-mono text-foreground text-right">
          {card.hasDbKey ? `••••${card.last4 ?? ''}` : card.envKeyPresent ? '.env fallback' : '—'}
        </dd>
        <dt className="font-bold text-muted-foreground">In use</dt>
        <dd className="text-right text-foreground">
          {card.activeSource === 'db' ? 'Stored key' : card.activeSource === 'env' ? '.env key' : 'Skipped'}
        </dd>
        <dt className="font-bold text-muted-foreground">Last tested</dt>
        <dd className="text-right text-foreground">
          {card.lastTestedAt
            ? `${new Date(card.lastTestedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${card.lastTestOk ? 'OK' : 'Failed'}`
            : 'Never'}
        </dd>
        <dt className="font-bold text-muted-foreground">Latency</dt>
        <dd className="text-right font-mono text-foreground">{card.lastLatencyMs !== null ? `${card.lastLatencyMs} ms` : '—'}</dd>
        <dt className="font-bold text-muted-foreground">Calls today</dt>
        <dd className="text-right font-mono text-foreground">{usageToday ?? '—'}</dd>
      </dl>

      {card.lastError && (
        <p className="rounded-lg bg-danger/10 border border-danger/20 px-3 py-2 text-[11px] text-danger break-words">{card.lastError}</p>
      )}

      {editing ? (
        <div className="space-y-2">
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder={`Paste ${PROVIDER_LABEL[card.provider]} API key`}
            className="h-10 rounded-xl font-mono"
          />
          <div className="flex gap-2">
            <Button size="sm" className="rounded-xl" disabled={busy || keyInput.trim().length < 8} onClick={saveKey}>
              Save key
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                setEditing(false);
                setKeyInput('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : confirmRevoke ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2">
          <span className="text-[12px] font-bold text-danger flex-1">Delete the stored key?</span>
          <Button
            size="sm"
            variant="destructive"
            className="rounded-xl"
            disabled={busy}
            onClick={async () => {
              await onAction(() => axios.delete('/api/admin/ai-keys', { params: { provider: card.provider } }), 'Key revoked');
              setConfirmRevoke(false);
            }}
          >
            Revoke
          </Button>
          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setConfirmRevoke(false)}>
            Keep
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="rounded-xl gap-1.5" disabled={busy} onClick={() => setEditing(true)}>
            <KeyRound className="h-3.5 w-3.5" />
            {card.hasDbKey ? 'Replace' : 'Add key'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl gap-1.5"
            disabled={busy || (!card.hasDbKey && !card.envKeyPresent)}
            onClick={() => onAction(() => axios.post('/api/admin/ai-keys/test', { provider: card.provider }), 'Test finished')}
          >
            <Zap className="h-3.5 w-3.5" />
            Test
          </Button>
          {card.hasDbKey && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl gap-1.5 text-danger hover:text-danger"
              disabled={busy}
              onClick={() => setConfirmRevoke(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Revoke
            </Button>
          )}
          <label className="ml-auto flex items-center gap-2 text-[12px] font-bold text-muted-foreground">
            Enabled
            <Switch
              checked={card.enabled}
              disabled={busy}
              onCheckedChange={(enabled) =>
                onAction(
                  () => axios.patch('/api/admin/ai-keys', { provider: card.provider, enabled }),
                  enabled ? 'Provider enabled' : 'Provider disabled'
                )
              }
            />
          </label>
        </div>
      )}
    </div>
  );
}

export default function AiSettingsTab() {
  const [state, setState] = useState<AiState | null>(null);
  const [usageToday, setUsageToday] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  useEffect(() => {
    axios
      .get('/api/admin/ai-keys')
      .then((res) => setState(res.data.data))
      .catch((error) => toast.error(errorMessage(error, 'Failed to load AI settings')));
    axios
      .get('/api/admin/ai-usage')
      .then((res) => {
        const today = new Date().toISOString().split('T')[0];
        setUsageToday((res.data.data || []).find((row: { date: string }) => row.date === today) || {});
      })
      .catch(() => setUsageToday(null));
  }, []);

  const runAction = useCallback(async (fn: () => Promise<{ data: { data: AiState } }>, success: string) => {
    setBusy(true);
    try {
      const res = await fn();
      setState(res.data.data);
      toast.success(success);
      return true;
    } catch (error) {
      toast.error(errorMessage(error, 'Request failed'));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const saveOrder = (providers: ProviderCard[]) => {
    setState((current) => (current ? { ...current, providers } : current));
    runAction(() => axios.put('/api/admin/ai-keys/order', { order: providers.map((p) => p.provider) }), 'Fallback order saved');
  };

  const move = (from: number, to: number) => {
    if (!state || from === to || to < 0 || to >= state.providers.length) return;
    const next = [...state.providers];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    saveOrder(next);
  };

  if (!state) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Card className="border-border bg-surface shadow-soft">
        <CardHeader className="pb-6 border-b border-border">
          <CardTitle className="text-xl font-black flex items-center gap-3 text-foreground tracking-tight uppercase">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <KeyRound className="h-5 w-5 text-primary" />
            </div>
            AI Provider Keys
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Keys are encrypted at rest and never shown again after saving. Order sets the fallback chain: the
            parser tries #1 first. A provider uses its stored key when enabled, otherwise the server .env key,
            otherwise it is skipped.
          </p>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          {!state.vaultConfigured && (
            <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-[13px] text-warning">
              <ShieldAlert className="h-5 w-5 shrink-0" />
              <span>
                AI_ENCRYPTION_KEY is not set on the server, so keys cannot be stored. Set a 32-byte key (64 hex chars)
                in the environment and restart. .env provider keys still work.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {state.providers.map((card, index) => (
              <ProviderKeyCard
                key={card.provider}
                card={card}
                position={index}
                total={state.providers.length}
                usageToday={usageToday ? Number(usageToday[USAGE_FIELD[card.provider]] ?? 0) : null}
                busy={busy}
                onAction={runAction}
                onMove={(delta) => move(index, index + delta)}
                dragOver={overIndex === index && dragIndex !== index}
                dragProps={{
                  draggable: !busy,
                  onDragStart: (e) => {
                    setDragIndex(index);
                    e.dataTransfer.effectAllowed = 'move';
                  },
                  onDragOver: (e) => {
                    e.preventDefault();
                    setOverIndex(index);
                  },
                  onDragLeave: () => setOverIndex((current) => (current === index ? null : current)),
                  onDrop: (e) => {
                    e.preventDefault();
                    if (dragIndex !== null) move(dragIndex, index);
                    setDragIndex(null);
                    setOverIndex(null);
                  },
                  onDragEnd: () => {
                    setDragIndex(null);
                    setOverIndex(null);
                  },
                }}
              />
            ))}
          </div>

          <div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">Audit log</h3>
            <div className="rounded-2xl border border-border overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-surface-muted/30 sticky top-0">
                  <tr className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    <th className="text-left py-2 px-3">When</th>
                    <th className="text-left py-2 px-3">Who</th>
                    <th className="text-left py-2 px-3">Provider</th>
                    <th className="text-left py-2 px-3">Action</th>
                    <th className="text-left py-2 px-3">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {state.auditLog.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-muted-foreground">
                        No key changes yet.
                      </td>
                    </tr>
                  ) : (
                    state.auditLog.map((entry) => (
                      <tr key={entry.id} className="border-t border-border/50">
                        <td className="py-2 px-3 whitespace-nowrap text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">{entry.userEmail || '—'}</td>
                        <td className="py-2 px-3 whitespace-nowrap">{PROVIDER_LABEL[entry.provider]}</td>
                        <td className="py-2 px-3 whitespace-nowrap font-bold">{entry.action}</td>
                        <td className="py-2 px-3 text-muted-foreground">{entry.detail || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      <AiUsageTab />
    </div>
  );
}
