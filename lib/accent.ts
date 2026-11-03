/**
 * Light-mode accent colour the user picks from the theme menu. Stored in
 * localStorage and cleared on logout/login, so it lasts for the session.
 * The colour values live in app/globals.css (`:root[data-accent=...]`).
 */
export const ACCENT_STORAGE_KEY = 'ayur-accent';

export const ACCENTS = [
  { id: 'green', label: 'Green', swatch: '#16a34a' },
  { id: 'blue', label: 'Blue', swatch: '#2563eb' },
  { id: 'purple', label: 'Purple', swatch: '#7c3aed' },
  { id: 'cocoa', label: 'Cocoa', swatch: '#7c4a2d' },
  { id: 'graphite', label: 'Graphite', swatch: '#334155' },
] as const;

export type AccentId = (typeof ACCENTS)[number]['id'];
export const DEFAULT_ACCENT: AccentId = 'green';

export function readAccent(): AccentId {
  try {
    const saved = localStorage.getItem(ACCENT_STORAGE_KEY);
    if (ACCENTS.some((a) => a.id === saved)) return saved as AccentId;
  } catch {
    /* storage blocked */
  }
  return DEFAULT_ACCENT;
}

export function applyAccent(id: AccentId) {
  document.documentElement.dataset.accent = id;
  try {
    if (id === DEFAULT_ACCENT) localStorage.removeItem(ACCENT_STORAGE_KEY);
    else localStorage.setItem(ACCENT_STORAGE_KEY, id);
  } catch {
    /* storage blocked */
  }
}

/** Back to the default green; call on logout and on a fresh login. */
export function clearAccent() {
  try {
    localStorage.removeItem(ACCENT_STORAGE_KEY);
  } catch {
    /* storage blocked */
  }
  if (typeof document !== 'undefined') delete document.documentElement.dataset.accent;
}

/** Runs before first paint (inline in app/layout.tsx) to avoid a colour flash. */
export const ACCENT_BOOT_SCRIPT = `try{var a=localStorage.getItem('${ACCENT_STORAGE_KEY}');if(a)document.documentElement.dataset.accent=a}catch(e){}`;
