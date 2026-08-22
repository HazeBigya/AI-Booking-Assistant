/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 'standalone' emits a minimal self-contained server in .next/standalone,
  // which keeps the production Docker image small (no full node_modules copy).
  output: "standalone",
};

module.exports = nextConfig;
