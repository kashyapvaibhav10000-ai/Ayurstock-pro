/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-plus-jakarta)', 'Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: 'var(--primary)',
          hover: 'var(--primary-hover)',
          light: '#dcfce7',
          foreground: '#ffffff',
        },
        surface: {
          DEFAULT: 'var(--surface)',
          muted: 'var(--surface-muted)',
          elevated: 'var(--surface-elevated)',
          border: 'var(--border)',
        },
        text: {
          primary: 'var(--foreground)',
          secondary: 'var(--muted-foreground)',
          muted: 'var(--muted-foreground)',
        },
        success: {
          DEFAULT: '#10b981',
          bg: '#ecfdf5',
          text: '#064e3b',
        },
        danger: {
          DEFAULT: '#ef4444',
          bg: '#fef2f2',
          text: '#7f1d1d',
        },
        warning: {
          DEFAULT: '#f59e0b',
          bg: '#fffbeb',
          text: '#78350f',
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
        'soft': '0 2px 10px -2px rgba(0,0,0,0.04)',
        'bento': '0px 2px 4px rgba(0,0,0,0.02), 0px 4px 12px rgba(0,0,0,0.05)',
        'bento-hover': '0px 4px 8px rgba(0,0,0,0.04), 0px 8px 24px rgba(0,0,0,0.08)',
        'elevated': '0 10px 25px -5px rgba(0,0,0,0.08), 0 8px 10px -6px rgba(0,0,0,0.04)',
      },
      spacing: {
        'micro': '4px',
        'small': '8px',
        'base': '16px',
        'large': '24px',
        'xlarge': '32px',
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
    },
  },
  plugins: [],
};
