/** @type {import('tailwindcss').Config} */

// Colors are RGB channels from app/globals.css so opacity modifiers work
// (e.g. bg-primary/10). Values are the original AyurStock palette.
const rgb = (name) => `rgb(var(--${name}-rgb) / <alpha-value>)`;

module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"', 'Inter', 'system-ui', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      // Apple type scale, set 1-2px below iOS sizes for dense desktop views.
      fontSize: {
        'large-title': ['32px', { lineHeight: '38px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'title-1': ['26px', { lineHeight: '32px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'title-2': ['21px', { lineHeight: '26px', letterSpacing: '-0.015em', fontWeight: '600' }],
        'title-3': ['19px', { lineHeight: '24px', letterSpacing: '-0.01em', fontWeight: '600' }],
        headline: ['15px', { lineHeight: '20px', letterSpacing: '-0.01em', fontWeight: '600' }],
        body: ['15px', { lineHeight: '22px' }],
        callout: ['14px', { lineHeight: '20px' }],
        subhead: ['13px', { lineHeight: '18px' }],
        footnote: ['12px', { lineHeight: '16px' }],
        caption: ['11px', { lineHeight: '14px', letterSpacing: '0.01em' }],
      },
      colors: {
        background: rgb('bg'),
        foreground: rgb('label'),
        primary: {
          DEFAULT: rgb('accent-fill'),
          hover: rgb('accent-fill-hover'),
          light: '#dcfce7',
          foreground: rgb('on-primary'),
        },
        surface: {
          DEFAULT: rgb('surface'),
          muted: rgb('fill'),
          elevated: rgb('surface-2'),
          border: 'var(--separator)',
        },
        border: 'var(--separator)',
        text: {
          primary: rgb('label'),
          secondary: rgb('label-2'),
          muted: rgb('label-2'),
        },
        // Apple semantic names
        label: {
          DEFAULT: rgb('label'),
          secondary: rgb('label-2'),
          tertiary: rgb('label-3'),
        },
        fill: {
          DEFAULT: rgb('fill'),
          strong: rgb('fill-strong'),
        },
        separator: {
          DEFAULT: 'var(--separator)',
          strong: 'var(--separator-strong)',
        },
        link: rgb('accent'),
        // shadcn/Radix names used by components/ui
        muted: { DEFAULT: rgb('fill'), foreground: rgb('label-2') },
        accent: { DEFAULT: rgb('fill'), foreground: rgb('label') },
        popover: { DEFAULT: rgb('surface'), foreground: rgb('label') },
        secondary: { DEFAULT: rgb('fill'), foreground: rgb('label') },
        destructive: { DEFAULT: rgb('red'), foreground: '#ffffff' },
        ring: rgb('accent'),
        input: rgb('fill-strong'),
        success: {
          DEFAULT: rgb('green'),
          bg: 'var(--success-bg)',
          text: 'var(--success-text)',
        },
        danger: {
          DEFAULT: rgb('red'),
          bg: 'var(--danger-bg)',
          text: 'var(--danger-text)',
        },
        warning: {
          DEFAULT: rgb('orange'),
          bg: 'var(--warning-bg)',
          text: 'var(--warning-text)',
        },
        stitch: {
          background: 'var(--stitch-surface)',
          surface: 'var(--stitch-surface)',
          surfaceLow: 'var(--stitch-surface-low)',
          surfaceLowest: 'var(--stitch-surface-lowest)',
          primary: 'var(--stitch-primary)',
          primaryDim: 'var(--stitch-primary-dim)',
          primaryContainer: 'var(--stitch-primary-container)',
          errorContainer: '#fa746f',
          tertiaryContainer: '#bbf5fe',
          outlineVariant: 'var(--stitch-outline-variant)',
          onSurface: 'var(--stitch-on-surface)',
          onSurfaceVariant: 'var(--stitch-on-surface-variant)',
        },
      },
      boxShadow: {
        soft: 'var(--shadow-card)',
        bento: 'var(--shadow-card)',
        'bento-hover': 'var(--shadow-card)',
        elevated: 'var(--shadow-pop)',
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
      spacing: {
        micro: '4px',
        small: '8px',
        base: '16px',
        large: '24px',
        xlarge: '32px',
      },
      borderRadius: {
        xl: '12px',
        '2xl': '18px',
        '3xl': '20px',
        card: '18px',
        sheet: '20px',
        control: '10px',
      },
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
      },
    },
  },
  plugins: [],
};
