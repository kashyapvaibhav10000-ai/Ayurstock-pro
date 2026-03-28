/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },

  webpack: (config) => {
    config.cache = false;
    return config;
  },
  turbopack: {},
};

module.exports = nextConfig;
