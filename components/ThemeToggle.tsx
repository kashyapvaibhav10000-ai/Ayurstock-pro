'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Palette, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ACCENTS, AccentId, applyAccent, readAccent } from '@/lib/accent';

/**
 * Global theme control, mounted in the shared dashboard header so every role
 * on every device can reach it.
 *
 * One button flips light <-> dark (sun in light, moon in dark). In light mode
 * a palette button next to it picks one of five accent colours; dark mode
 * keeps its own turmeric accent. next-themes persists the light/dark choice;
 * lib/accent.ts persists the colour until logout.
 */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [accent, setAccent] = useState<AccentId>('green');

  // The theme is only known after mount (next-themes applies it before
  // hydration with an inline script, but the hook value is not safe earlier).
  useEffect(() => {
    setMounted(true);
    setAccent(readAccent());
  }, []);

  // "System" was removed; anyone who had it saved lands on light.
  useEffect(() => {
    if (mounted && theme !== 'light' && theme !== 'dark') setTheme('light');
  }, [mounted, theme, setTheme]);

  if (!mounted) {
    // Reserve the same footprint to prevent layout shift once mounted.
    return <div className={`h-9 w-[76px] ${className}`} aria-hidden="true" />;
  }

  const isDark = resolvedTheme === 'dark';
  const iconButton =
    'flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-[background-color,color,transform] duration-200 hover:bg-fill hover:text-foreground active:scale-[0.92] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/35';

  return (
    <div className={`inline-flex items-center gap-0.5 ${className}`}>
      <button
        type="button"
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={isDark ? 'Light mode' : 'Dark mode'}
        className={iconButton}
      >
        {isDark ? <Moon className="h-[18px] w-[18px] stroke-[1.75]" /> : <Sun className="h-[18px] w-[18px] stroke-[1.75]" />}
      </button>

      {!isDark && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Accent colour" title="Accent colour" className={iconButton}>
              <Palette className="h-[18px] w-[18px] stroke-[1.75]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-48 p-1.5">
            <DropdownMenuLabel className="px-2 pb-1.5 pt-1 text-[12px] font-medium text-muted-foreground">Accent colour</DropdownMenuLabel>
            {ACCENTS.map((option) => (
              <DropdownMenuItem
                key={option.id}
                onSelect={() => {
                  applyAccent(option.id);
                  setAccent(option.id);
                }}
                className="gap-2.5 py-2"
              >
                <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: option.swatch }} aria-hidden="true" />
                <span className="flex-1">{option.label}</span>
                {accent === option.id && <Check className="h-4 w-4 stroke-[2] text-foreground" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
