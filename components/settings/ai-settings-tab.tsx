'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ArrowDown,
  ArrowUp,
  Check,
  GripVertical,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Route,
  ShieldAlert,
  Trash2,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import AiUsageTab from '@/components/settings/ai-usage-tab';
import { cn } from '@/lib/utils';

type Feature = 'INVOICE_IMPORT' | 'MEDICINE_IMPORT' | 'MEDICINE_BATCH_REPARSE';

interface AdapterInfo {
  id: string;
  name: string;
  supportsPdf: boolean;
  supportsImage: boolean;
  defaultModel: string;
  requiresModel: boolean;
  requiresBaseUrl: boolean;
  envFallback: boolean;
}

interface ProviderCard {
  id: string;
  provider: string | null;
  adapter: string;
  displayName: string;
  model: string | null;
  baseUrl: string | null;
  defaultModel: string;
  supportsPdf: boolean;
  supportsImage: boolean;
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
  usedBy: Feature[];
  callsToday: Partial<Record<Feature, number>>;
  lastCallError: { feature: Feature; error: string | null; at: string } | null;
}

interface FeatureRow {
  feature: Feature;
  label: string;
  customOrder: string[] | null;
  requestsToday: number;
  requests7d: number;
  successRate7d: number | null;
  lastServed: { instanceId: string | null; providerName: string; at: string } | null;
  lastAttempt: { providerName: string; success: boolean; error: string | null; at: string } | null;
}

interface AuditEntry {
  id: string;
  provider: string | null;
  instanceName: string | null;
  action: string;
  detail: string | null;
  userEmail: string | null;
  createdAt: string;
}

interface AiState {
  vaultConfigured: boolean;
  adapters: AdapterInfo[];
  providers: ProviderCard[];
  features: FeatureRow[];
  auditLog: AuditEntry[];
}

type RunAction = (fn: () => Promise<{ data: { data: AiState } }>, success: string) => Promise<boolean>;

function statusOf(card: ProviderCard): { dot: string; text: string } {
  if (!card.enabled) return { dot: 'bg-muted-foreground/40', text: 'Disabled' };
  if (!card.activeSource) return { dot: 'bg-muted-foreground/40', text: 'No key' };
  if (card.lastTestOk === false) return { dot: 'bg-danger', text: 'Last test failed' };
  if (card.lastTestOk === true) return { dot: 'bg-success', text: 'Working' };
  return { dot: 'bg-warning', text: 'Not tested' };
}

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) ? error.response?.data?.message || fallback : fallback;
}

function when(value: string) {
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function CapabilityBadges({ pdf, image }: { pdf: boolean; image: boolean }) {
  const badges = [pdf && 'PDF', image && 'Image', 'Text'].filter(Boolean) as string[];
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((badge) => (
        <span
          key={badge}
          className="rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-primary"
        >
          {badge}
        </span>
      ))}
    </div>
  );
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-danger text-white hover:bg-danger/90" onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ProviderInstanceCard({
  card,
  adapterName,
  featureLabel,
  position,
  total,
  busy,
  onAction,
  onMove,
  dragProps,
  dragOver,
}: {
  card: ProviderCard;
  adapterName: string;
  featureLabel: (feature: Feature) => string;
  position: number;
  total: number;
  busy: boolean;
  onAction: RunAction;
  onMove: (delta: -1 | 1) => void;
  dragProps: React.HTMLAttributes<HTMLDivElement> & { draggable: boolean };
  dragOver: boolean;
}) {
  const [editingKey, setEditingKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [editingModel, setEditingModel] = useState(false);
  const [modelInput, setModelInput] = useState('');
  const [confirm, setConfirm] = useState<'revoke' | 'remove' | null>(null);
  const status = statusOf(card);
  const callsToday = Object.values(card.callsToday).reduce((sum, n) => sum + (n ?? 0), 0);

  const saveKey = async () => {
    const ok = await onAction(() => axios.post('/api/admin/ai-keys', { id: card.id, key: keyInput.trim() }), `${card.displayName} key saved`);
    // The plaintext is dropped from state either way; it is never shown again.
    setKeyInput('');
    if (ok) setEditingKey(false);
  };

  const saveModel = async () => {
    const ok = await onAction(
      () => axios.patch('/api/admin/ai-keys', { id: card.id, model: modelInput.trim() || null }),
      'Model saved'
    );
    if (ok) setEditingModel(false);
  };

  return (
    <div
      {...dragProps}
      className={cn(
        'rounded-2xl border bg-background p-5 space-y-4 transition-colors',
        dragOver ? 'border-primary ring-2 ring-primary/20' : 'border-border',
        !card.enabled && 'opacity-70'
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
          <div className="min-w-0 space-y-1">
            <div className="text-[15px] font-black text-foreground truncate">{card.displayName}</div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className={cn('h-2 w-2 rounded-full', status.dot)} />
                {status.text}
              </span>
              {card.displayName !== adapterName && <span>· {adapterName}</span>}
            </div>
            <CapabilityBadges pdf={card.supportsPdf} image={card.supportsImage} />
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
        <dt className="font-bold text-muted-foreground">Model</dt>
        <dd className="text-right">
          {editingModel ? (
            <div className="flex items-center justify-end gap-1">
              <Input
                autoFocus
                value={modelInput}
                onChange={(e) => setModelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveModel();
                  if (e.key === 'Escape') setEditingModel(false);
                }}
                placeholder={card.defaultModel || 'model id'}
                className="h-7 rounded-lg font-mono text-[12px]"
              />
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" disabled={busy} onClick={saveModel} aria-label="Save model">
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditingModel(false)} aria-label="Cancel">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              className="group inline-flex items-center gap-1 font-mono text-foreground hover:text-primary"
              disabled={busy}
              onClick={() => {
                setModelInput(card.model ?? '');
                setEditingModel(true);
              }}
              title="Edit model"
            >
              {card.model || <span className="text-muted-foreground">default ({card.defaultModel})</span>}
              <Pencil className="h-3 w-3 opacity-50 group-hover:opacity-100" />
            </button>
          )}
        </dd>
        {card.baseUrl && (
          <>
            <dt className="font-bold text-muted-foreground">Base URL</dt>
            <dd className="text-right font-mono text-foreground break-all">{card.baseUrl}</dd>
          </>
        )}
        <dt className="font-bold text-muted-foreground">Key</dt>
        <dd className="font-mono text-foreground text-right">
          {card.hasDbKey ? `••••${card.last4 ?? ''}` : card.envKeyPresent ? '.env fallback' : '—'}
        </dd>
        <dt className="font-bold text-muted-foreground">In use</dt>
        <dd className="text-right text-foreground">
          {!card.enabled ? 'Skipped (disabled)' : card.activeSource === 'db' ? 'Stored key' : card.activeSource === 'env' ? '.env key' : 'Skipped'}
        </dd>
        <dt className="font-bold text-muted-foreground">Last tested</dt>
        <dd className="text-right text-foreground">
          {card.lastTestedAt ? `${when(card.lastTestedAt)} · ${card.lastTestOk ? 'OK' : 'Failed'}` : 'Never'}
        </dd>
        <dt className="font-bold text-muted-foreground">Latency</dt>
        <dd className="text-right font-mono text-foreground">{card.lastLatencyMs !== null ? `${card.lastLatencyMs} ms` : '—'}</dd>
        <dt className="font-bold text-muted-foreground">Calls today</dt>
        <dd className="text-right font-mono text-foreground">{callsToday}</dd>
      </dl>

      <div className="space-y-1 text-[12px]">
        <p>
          <span className="font-bold text-muted-foreground">Used by: </span>
          <span className="text-foreground">{card.usedBy.length ? card.usedBy.map(featureLabel).join(', ') : 'No feature'}</span>
        </p>
        {callsToday > 0 && (
          <p className="text-muted-foreground">
            Today:{' '}
            {(Object.entries(card.callsToday) as [Feature, number][])
              .map(([feature, count]) => `${featureLabel(feature)} ${count}`)
              .join(' · ')}
          </p>
        )}
      </div>

      {card.lastCallError && (
        <p className="rounded-lg bg-danger/10 border border-danger/20 px-3 py-2 text-[11px] text-danger break-words">
          <span className="font-black">Last call error · {featureLabel(card.lastCallError.feature)}</span> ({when(card.lastCallError.at)}):{' '}
          {card.lastCallError.error || 'failed'}
        </p>
      )}
      {card.lastError && (
        <p className="rounded-lg bg-danger/10 border border-danger/20 px-3 py-2 text-[11px] text-danger break-words">
          <span className="font-black">Test:</span> {card.lastError}
        </p>
      )}

      {editingKey ? (
        <div className="space-y-2">
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder={`Paste ${card.displayName} API key`}
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
                setEditingKey(false);
                setKeyInput('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="rounded-xl gap-1.5" disabled={busy} onClick={() => setEditingKey(true)}>
            <KeyRound className="h-3.5 w-3.5" />
            {card.hasDbKey ? 'Replace' : 'Add key'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl gap-1.5"
            disabled={busy || (!card.hasDbKey && !card.envKeyPresent)}
            onClick={() => onAction(() => axios.post('/api/admin/ai-keys/test', { id: card.id }), 'Test finished')}
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
              onClick={() => setConfirm('revoke')}
            >
              <KeyRound className="h-3.5 w-3.5" />
              Revoke
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl gap-1.5 text-danger hover:text-danger"
            disabled={busy}
            onClick={() => setConfirm('remove')}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </Button>
          <label className="ml-auto flex items-center gap-2 text-[12px] font-bold text-muted-foreground">
            Enabled
            <Switch
              checked={card.enabled}
              disabled={busy}
              onCheckedChange={(enabled) =>
                onAction(
                  () => axios.patch('/api/admin/ai-keys', { id: card.id, enabled }),
                  enabled ? 'Provider enabled' : 'Provider disabled'
                )
              }
            />
          </label>
        </div>
      )}

      <ConfirmDialog
        open={confirm === 'revoke'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Revoke ${card.displayName} key`}
        description="Permanently delete this key? Falls back to .env key if set, else provider skipped."
        confirmLabel="Revoke key"
        onConfirm={() => onAction(() => axios.delete('/api/admin/ai-keys', { params: { id: card.id } }), 'Key revoked')}
      />
      <ConfirmDialog
        open={confirm === 'remove'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Remove ${card.displayName}`}
        description={`Permanently delete this provider and its key?${
          card.envKeyPresent ? ' Its .env key will no longer be used unless you add this provider again.' : ''
        }`}
        confirmLabel="Remove provider"
        onConfirm={() => onAction(() => axios.delete('/api/admin/ai-keys/instances', { params: { id: card.id } }), 'Provider removed')}
      />
    </div>
  );
}

function AddProviderDialog({
  open,
  onOpenChange,
  adapters,
  busy,
  onAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adapters: AdapterInfo[];
  busy: boolean;
  onAction: RunAction;
}) {
  const [adapterId, setAdapterId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [key, setKey] = useState('');
  const [testing, setTesting] = useState(false);
  // Result of the last test, valid only for the exact values it was run with.
  const [test, setTest] = useState<{ signature: string; ok: boolean; latencyMs: number; error: string | null } | null>(null);

  const adapter = adapters.find((a) => a.id === adapterId) ?? null;
  const signature = JSON.stringify([adapterId, model.trim(), baseUrl.trim(), key.trim()]);
  const testPassed = test?.ok && test.signature === signature;
  const complete =
    adapter && key.trim().length >= 8 && (!adapter.requiresModel || model.trim()) && (!adapter.requiresBaseUrl || baseUrl.trim());

  const reset = () => {
    setAdapterId(null);
    setDisplayName('');
    setModel('');
    setBaseUrl('');
    setKey('');
    setTest(null);
  };

  const payload = () => ({
    adapter: adapterId,
    displayName: displayName.trim() || null,
    model: model.trim() || null,
    baseUrl: adapter?.requiresBaseUrl ? baseUrl.trim() : null,
    key: key.trim(),
  });

  const runTest = async () => {
    setTesting(true);
    try {
      const res = await axios.post('/api/admin/ai-keys/test', payload());
      setTest({ signature, ...res.data.data });
    } catch (error) {
      setTest({ signature, ok: false, latencyMs: 0, error: errorMessage(error, 'Test failed') });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    const ok = await onAction(() => axios.post('/api/admin/ai-keys/instances', payload()), 'Provider added');
    if (ok) {
      reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add AI provider</DialogTitle>
          <DialogDescription>
            Pick the API format, then test the key. The provider joins the end of the fallback chain.
          </DialogDescription>
        </DialogHeader>

        {!adapter ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {adapters.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setAdapterId(option.id)}
                className="rounded-xl border border-border p-3 text-left hover:border-primary hover:bg-primary/5 space-y-1.5"
              >
                <div className="text-[13px] font-black text-foreground">{option.name}</div>
                <CapabilityBadges pdf={option.supportsPdf} image={option.supportsImage} />
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-1">
                <div className="text-[13px] font-black text-foreground">{adapter.name}</div>
                <CapabilityBadges pdf={adapter.supportsPdf} image={adapter.supportsImage} />
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>
                Change
              </Button>
            </div>
            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-muted-foreground">Name</span>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={adapter.name} className="h-10 rounded-xl" />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-muted-foreground">Model{adapter.requiresModel ? '' : ' (optional)'}</span>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={adapter.defaultModel || 'e.g. deepseek-chat'}
                className="h-10 rounded-xl font-mono"
              />
            </label>
            {adapter.requiresBaseUrl && (
              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-muted-foreground">Base URL</span>
                <Input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.deepseek.com/v1"
                  className="h-10 rounded-xl font-mono"
                />
              </label>
            )}
            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-muted-foreground">API key</span>
              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="h-10 rounded-xl font-mono"
              />
            </label>
            {test && test.signature === signature && (
              <p
                className={cn(
                  'rounded-lg border px-3 py-2 text-[12px] break-words',
                  test.ok ? 'border-success/30 bg-success/10 text-success' : 'border-danger/30 bg-danger/10 text-danger'
                )}
              >
                {test.ok ? `Key works (${test.latencyMs} ms).` : `Test failed: ${test.error || 'unknown error'}`}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" className="rounded-xl gap-1.5" disabled={!complete || testing || busy} onClick={runTest}>
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Test
          </Button>
          <Button className="rounded-xl" disabled={!complete || !testPassed || busy} onClick={save}>
            Save provider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FeatureRouteDialog({
  feature,
  providers,
  busy,
  onAction,
  onClose,
}: {
  feature: FeatureRow;
  providers: ProviderCard[];
  busy: boolean;
  onAction: RunAction;
  onClose: () => void;
}) {
  const [order, setOrder] = useState<string[]>(feature.customOrder ?? providers.filter((p) => p.enabled).map((p) => p.id));
  const byId = new Map(providers.map((p) => [p.id, p]));
  const unused = providers.filter((p) => !order.includes(p.id));

  const move = (index: number, delta: -1 | 1) => {
    const next = [...order];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setOrder(next);
  };

  const save = async (value: string[] | null, success: string) => {
    const ok = await onAction(() => axios.put('/api/admin/ai-keys/features', { feature: feature.feature, order: value }), success);
    if (ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{feature.label}: provider order</DialogTitle>
          <DialogDescription>
            Only the listed providers are tried, in this order. Disabled providers and providers without a key are skipped.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-1.5">
          {order.map((id, index) => {
            const provider = byId.get(id);
            if (!provider) return null;
            return (
              <li key={id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-[13px]">
                <span className="w-5 text-center font-black text-primary">{index + 1}</span>
                <span className="flex-1 font-bold truncate">{provider.displayName}</span>
                {!provider.enabled && <span className="text-[11px] text-muted-foreground">disabled</span>}
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move up">
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === order.length - 1} onClick={() => move(index, 1)} aria-label="Move down">
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOrder(order.filter((o) => o !== id))} aria-label="Remove from order">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ol>
        {unused.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {unused.map((provider) => (
              <Button key={provider.id} size="sm" variant="outline" className="rounded-xl gap-1" onClick={() => setOrder([...order, provider.id])}>
                <Plus className="h-3 w-3" />
                {provider.displayName}
              </Button>
            ))}
          </div>
        )}

        <DialogFooter>
          {feature.customOrder && (
            <Button variant="outline" className="rounded-xl" disabled={busy} onClick={() => save(null, 'Using the default chain')}>
              Use default chain
            </Button>
          )}
          <Button className="rounded-xl" disabled={busy || order.length === 0} onClick={() => save(order, 'Feature order saved')}>
            Save custom order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FeaturesSection({ state, busy, onAction }: { state: AiState; busy: boolean; onAction: RunAction }) {
  const [editing, setEditing] = useState<Feature | null>(null);
  const names = new Map(state.providers.map((p) => [p.id, p.displayName]));
  const editingRow = state.features.find((f) => f.feature === editing) ?? null;

  return (
    <div>
      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">Features</h3>
      <div className="rounded-2xl border border-border overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-surface-muted/30">
            <tr className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <th className="text-left py-2 px-3">Feature</th>
              <th className="text-left py-2 px-3">Last served by</th>
              <th className="text-right py-2 px-3">Success 7d</th>
              <th className="text-right py-2 px-3">Calls today / 7d</th>
              <th className="text-left py-2 px-3">Provider order</th>
            </tr>
          </thead>
          <tbody>
            {state.features.map((row) => (
              <tr key={row.feature} className="border-t border-border/50 align-top">
                <td className="py-2 px-3 font-bold whitespace-nowrap">{row.label}</td>
                <td className="py-2 px-3">
                  {row.lastServed ? (
                    <>
                      <div className="text-foreground">
                        {(row.lastServed.instanceId && names.get(row.lastServed.instanceId)) || row.lastServed.providerName}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{when(row.lastServed.at)}</div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                  {row.lastAttempt && !row.lastAttempt.success && (
                    <div className="mt-1 flex items-start gap-1 text-[11px] text-danger break-words">
                      <XCircle className="h-3 w-3 mt-0.5 shrink-0" />
                      Last call failed ({row.lastAttempt.providerName}): {row.lastAttempt.error || 'failed'}
                    </div>
                  )}
                </td>
                <td className="py-2 px-3 text-right font-mono whitespace-nowrap">
                  {row.successRate7d === null ? '—' : `${Math.round(row.successRate7d * 100)}%`}
                </td>
                <td className="py-2 px-3 text-right font-mono whitespace-nowrap">
                  {row.requestsToday} / {row.requests7d}
                </td>
                <td className="py-2 px-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className={cn(row.customOrder ? 'text-foreground' : 'text-muted-foreground')}>
                      {row.customOrder ? row.customOrder.map((id) => names.get(id) ?? '?').join(' → ') : 'Default chain'}
                    </span>
                    <Button variant="ghost" size="sm" className="h-7 rounded-lg gap-1 shrink-0" disabled={busy} onClick={() => setEditing(row.feature)}>
                      <Route className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        A call is one parse request; it succeeds if any provider in the chain returned medicines.
      </p>
      {editingRow && (
        <FeatureRouteDialog
          feature={editingRow}
          providers={state.providers}
          busy={busy}
          onAction={onAction}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

export default function AiSettingsTab() {
  const [state, setState] = useState<AiState | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  useEffect(() => {
    axios
      .get('/api/admin/ai-keys')
      .then((res) => setState(res.data.data))
      .catch((error) => toast.error(errorMessage(error, 'Failed to load AI settings')));
  }, []);

  const runAction: RunAction = useCallback(async (fn, success) => {
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

  const adapterNames = useMemo(() => new Map(state?.adapters.map((a) => [a.id, a.name]) ?? []), [state?.adapters]);
  const featureLabels = useMemo(() => new Map(state?.features.map((f) => [f.feature, f.label]) ?? []), [state?.features]);

  const saveOrder = (providers: ProviderCard[]) => {
    setState((current) => (current ? { ...current, providers } : current));
    runAction(() => axios.put('/api/admin/ai-keys/order', { order: providers.map((p) => p.id) }), 'Fallback order saved');
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
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle className="text-xl font-black flex items-center gap-3 text-foreground tracking-tight uppercase">
              <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
                <KeyRound className="h-5 w-5 text-primary" />
              </div>
              AI Providers
            </CardTitle>
            <Button className="rounded-xl gap-1.5" disabled={busy || !state.vaultConfigured} onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" />
              Add provider
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Keys are encrypted at rest and never shown again after saving. Order sets the fallback chain: the parser
            tries #1 first, skipping disabled providers, providers without a key, and providers that cannot read the
            file type (PDF / image) for that step. Gemini, Groq, Mistral and OpenRouter fall back to the server .env
            key when no key is stored.
          </p>
        </CardHeader>
        <CardContent className="pt-6 space-y-8">
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
              <ProviderInstanceCard
                key={card.id}
                card={card}
                adapterName={adapterNames.get(card.adapter) ?? card.adapter}
                featureLabel={(feature) => featureLabels.get(feature) ?? feature}
                position={index}
                total={state.providers.length}
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
            {state.providers.length === 0 && (
              <p className="text-sm text-muted-foreground">No providers. Add one to enable AI parsing.</p>
            )}
          </div>

          <FeaturesSection state={state} busy={busy} onAction={runAction} />

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
                        <td className="py-2 px-3 whitespace-nowrap text-muted-foreground">{when(entry.createdAt)}</td>
                        <td className="py-2 px-3 whitespace-nowrap">{entry.userEmail || '—'}</td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {entry.instanceName || (entry.provider && adapterNames.get(entry.provider)) || '—'}
                        </td>
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

      <AddProviderDialog open={adding} onOpenChange={setAdding} adapters={state.adapters} busy={busy} onAction={runAction} />

      <AiUsageTab />
    </div>
  );
}
