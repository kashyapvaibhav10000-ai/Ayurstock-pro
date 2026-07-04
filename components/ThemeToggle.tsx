'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';

/**
 * Global theme toggle — Light / Dark / System.
 *
 * ROOT CAUSE OF THE "STUCK ON MOBILE" BUG:
 * The only theme control in the app previously lived inside
 * Settings → System Calibration, which is an ADMIN-only page (both the
 * settings route itself and the mobile bottom-nav item are gated to the
 * ADMIN role). Any Manager/Cashier — who make up most day-to-day mobile
 * users — had NO way to reach a theme control at all, so their device
 * appeared permanently "stuck" at whatever theme first resolved (often
 * dark, if their OS/browser prefers dark and no explicit choice was ever
 * saved). This component is mounted in the shared dashboard header so
 * EVERY role, on EVERY device (including PWA/mobile), can change theme.
 *
 * next-themes already handles persistence (localStorage), system-preference
 * following (via `enableSystem` + matchMedia listener), and applies the
 * resolved theme as a class on <html> before hydration (via the inline
 * script injected through `attribute="class"` in ThemeProvider), so no
 * custom localStorage or matchMedia code is needed here — reimplementing
 * that would be the "workaround" the task explicitly asks us to avoid.
 */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch: next-themes only knows the real theme after
  // mount (the resolved theme is applied via an inline script that runs
  // before React hydrates, but the `theme` value from the hook is not safe
  // to read until mount).
  useEffect(() => setMounted(true), []);

  const options: { value: 'light' | 'dark' | 'system'; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];

  if (!mounted) {
    // Reserve the same footprint to prevent layout shift once mounted.
    return <div className={`h-10 w-[132px] rounded-xl ${className}`} aria-hidden="true" />;
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={`inline-flex items-center gap-0.5 rounded-xl border border-border bg-surface p-1 shadow-soft ${className}`}
    >
      {options.map(({ value, label, icon: Icon }) => {
        const isActive = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={`${label} theme`}
            title={`${label} theme`}
            onClick={() => setTheme(value)}
            className={`flex h-8 min-w-[44px] items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
