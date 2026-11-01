// Content-Security-Policy is set per request in proxy.ts (it carries a
// script nonce); these headers are static.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
