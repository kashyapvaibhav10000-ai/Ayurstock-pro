/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#059669',
        secondary: '#e2e8f0',
        accent: '#10b981',
        background: '#f8fafc',
      },
    },
  },
  plugins: [],
};
