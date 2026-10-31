/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== 'production';

// Third parties the browser talks to: Google Fonts (POS icon font), the
// pdf.js worker on cdnjs, and tesseract.js (worker, wasm core and language
// data from jsdelivr / projectnaptha) for in-browser OCR. Next.js needs
// inline scripts for hydration; dev mode also needs eval.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''} https://cdnjs.cloudflare.com https://cdn.jsdelivr.net`,
  "worker-src 'self' blob: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  `connect-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://tessdata.projectnaptha.com${isDev ? ' ws:' : ''}`,
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    // The proxy reads every /api request (CSRF check). Uploads are capped at
    // 20 MB by the routes; anything larger is refused in proxy.ts first.
    proxyClientMaxBodySize: '25mb',
  },

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },

  webpack: (config) => {
    config.cache = false;
    return config;
  },
  turbopack: {},
};

module.exports = nextConfig;
