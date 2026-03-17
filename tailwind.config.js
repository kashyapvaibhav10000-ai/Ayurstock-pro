/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0ea5e9', // Clean accessible blue
          hover: '#0284c7',   // Darker hover state
          light: '#e0f2fe',
        },
        surface: {
          DEFAULT: '#ffffff',
          muted: '#f8fafc',
          border: '#e2e8f0',
        },
        text: {
          primary: '#0f172a',
          secondary: '#64748b',
          muted: '#94a3b8',
        },
        success: {
          DEFAULT: '#10b981',
          bg: '#d1fae5',
          text: '#065f46',
        },
        danger: {
          DEFAULT: '#ef4444',
          bg: '#fee2e2',
          text: '#991b1b',
        },
        warning: {
          DEFAULT: '#f59e0b',
          bg: '#fef3c7',
          text: '#92400e',
        }
      },
      boxShadow: {
        'soft': '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
        'elevated': '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
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
      }
    },
  },
  plugins: [],
};
