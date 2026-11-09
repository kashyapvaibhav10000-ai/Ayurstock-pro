'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';

interface DecimalInputProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  placeholder?: string;
  ariaLabel: string;
  /** data-row / data-field markers used for Enter-key focus moves. */
  row?: string;
  field?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * Money field for phones: decimal keypad, digits and one dot, 2 decimals.
 * Keeps the typed text (so "12." survives) and reports a number; 0 shows
 * as empty so the placeholder is visible.
 */
export function DecimalInput({ value, onChange, className, placeholder, ariaLabel, row, field, onKeyDown }: DecimalInputProps) {
  const [text, setText] = useState(value ? String(value) : '');

  useEffect(() => {
    if ((Number(text) || 0) !== (value || 0)) setText(value ? String(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoComplete="off"
      enterKeyHint="next"
      className={className}
      data-row={row}
      data-field={field}
      onKeyDown={onKeyDown}
      onChange={(event) => {
        const cleaned = event.target.value
          .replace(/[^\d.]/g, '')
          .replace(/(\..*)\./g, '$1')
          .replace(/^(\d*\.\d{0,2}).*$/, '$1')
          .slice(0, 10);
        setText(cleaned);
        onChange(Number(cleaned) || 0);
      }}
    />
  );
}
