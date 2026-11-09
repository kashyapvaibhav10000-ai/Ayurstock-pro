'use client';

import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';

export interface PickerMedicine {
  id: string;
  name: string;
  company: string;
  category?: string | null;
  packing?: string | null;
}

interface MedicineComboboxProps {
  /** data-row / data-field markers used for Enter-key focus moves. */
  'data-row'?: string;
  'data-field'?: string;
  value: string;
  selectedId: string;
  options: PickerMedicine[];
  className?: string;
  placeholder?: string;
  onTextChange: (text: string) => void;
  onSelect: (medicine: PickerMedicine) => void;
  /** Enter with the list closed (or nothing highlighted) moves on. */
  onEnterNext?: () => void;
}

const MAX_ROWS = 40;

/**
 * Type-to-search medicine field with a dropdown, like Add Inventory:
 * arrows move, Enter picks the highlighted row, Escape closes. Picking
 * reports the medicine; the caller fills the rest of the row.
 */
export const MedicineCombobox = forwardRef<HTMLInputElement, MedicineComboboxProps>(function MedicineCombobox(
  { value, selectedId, options, className, placeholder = 'Type medicine name', onTextChange, onSelect, onEnterNext, ...markers },
  ref
) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const matches = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return options.slice(0, MAX_ROWS);
    const starts: PickerMedicine[] = [];
    const contains: PickerMedicine[] = [];
    for (const medicine of options) {
      const name = medicine.name.toLowerCase();
      if (name.startsWith(query)) starts.push(medicine);
      else if (name.includes(query) || medicine.company.toLowerCase().includes(query)) contains.push(medicine);
      if (starts.length >= MAX_ROWS) break;
    }
    return [...starts, ...contains].slice(0, MAX_ROWS);
  }, [options, value]);

  useEffect(() => {
    if (highlight < 0) return;
    listRef.current?.children[highlight]?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  const pick = (medicine: PickerMedicine) => {
    onSelect(medicine);
    setOpen(false);
    setHighlight(-1);
  };

  const showList = open && !selectedId && matches.length > 0;

  // The list is position: fixed so table/card overflow cannot clip it.
  useEffect(() => {
    if (!showList) return;
    const place = () => {
      const box = boxRef.current?.getBoundingClientRect();
      if (box) setRect({ top: box.bottom + 4, left: box.left, width: Math.max(box.width, 260) });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [showList]);

  return (
    <div ref={boxRef} className="relative min-w-0">
      <Input
        ref={ref}
        {...markers}
        value={value}
        className={className}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
        enterKeyHint="next"
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(event) => {
          onTextChange(event.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && matches.length) {
            event.preventDefault();
            setOpen(true);
            setHighlight((h) => Math.min(h + 1, matches.length - 1));
          } else if (event.key === 'ArrowUp' && matches.length) {
            event.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (event.key === 'Escape') {
            setOpen(false);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            if (showList) {
              // Enter picks the highlighted row, or the only/first match.
              const target = matches[highlight >= 0 ? highlight : 0];
              if (target) {
                pick(target);
                return;
              }
            }
            onEnterNext?.();
          }
        }}
      />
      {showList && rect && (
        <ul
          ref={listRef}
          role="listbox"
          style={{ top: rect.top, left: rect.left, width: Math.min(rect.width, window.innerWidth - rect.left - 8) }}
          className="fixed z-[60] max-h-64 overflow-y-auto rounded-xl border border-border bg-surface shadow-lg"
        >
          {matches.map((medicine, index) => (
            <li
              key={medicine.id}
              role="option"
              aria-selected={index === highlight}
              className={`cursor-pointer px-3 py-2 text-sm ${index === highlight ? 'bg-primary/10' : 'hover:bg-surface-muted'}`}
              // mousedown keeps focus (and the phone keyboard) in the field.
              onMouseDown={(event) => {
                event.preventDefault();
                pick(medicine);
              }}
            >
              <div className="truncate font-semibold text-foreground">{medicine.name}</div>
              <div className="truncate text-[11px] text-muted-foreground">
                {medicine.company}
                {medicine.packing ? ` · ${medicine.packing}` : ''}
                {medicine.category ? ` · ${medicine.category}` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
