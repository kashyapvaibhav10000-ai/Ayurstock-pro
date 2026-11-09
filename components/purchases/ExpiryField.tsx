'use client';

import { forwardRef, useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { expiryToMmyy, parseExpiryShorthand } from '@/lib/stock-entry';

interface ExpiryFieldProps {
  /** data-row / data-field markers used for Enter-key focus moves. */
  'data-row'?: string;
  'data-field'?: string;
  /** ISO date (YYYY-MM-DD) or ''. */
  value: string;
  onChange: (iso: string) => void;
  className?: string;
  onEnterNext?: () => void;
}

/**
 * Expiry typed as MMYY (e.g. 0727), like Add Inventory, with a calendar
 * button as a fallback. Reports an ISO date once the text is a valid month.
 */
export const ExpiryField = forwardRef<HTMLInputElement, ExpiryFieldProps>(function ExpiryField(
  { value, onChange, className = '', onEnterNext, ...markers },
  ref
) {
  const [text, setText] = useState(() => expiryToMmyy(value));

  // Follow outside changes (scan apply, batch pick, reset).
  useEffect(() => {
    // Partly typed text (value still '') is left alone.
    if (value) {
      if (expiryToMmyy(value) !== text) setText(expiryToMmyy(value));
    } else if (parseExpiryShorthand(text)) {
      setText('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const invalid = text.length === 4 && !parseExpiryShorthand(text);

  return (
    <div className="flex min-w-0 gap-1.5">
      <Input
        ref={ref}
        {...markers}
        value={text}
        placeholder="MMYY"
        aria-label="Expiry (MMYY)"
        aria-invalid={invalid}
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        autoComplete="off"
        enterKeyHint="next"
        className={`min-w-0 flex-1 ${invalid ? 'border-danger' : ''} ${className}`}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, '').slice(0, 4);
          setText(digits);
          const parsed = parseExpiryShorthand(digits);
          onChange(parsed ?? '');
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (parseExpiryShorthand(text)) onEnterNext?.();
          }
        }}
      />
      <div className={`relative w-10 shrink-0 ${className}`}>
        <Input
          type="date"
          tabIndex={-1}
          value={value ? value.slice(0, 10) : ''}
          aria-label="Pick expiry date"
          title="Pick expiry date"
          className="h-full w-10 min-w-0 cursor-pointer px-1 text-transparent [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
          onChange={(event) => {
            setText(expiryToMmyy(event.target.value));
            onChange(event.target.value);
          }}
        />
        <CalendarDays className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
});
