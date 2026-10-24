import type { NextConfig } from 'next';

// Next runs on :3001 so a local SpacetimeDB can keep its default :3000.
const nextConfig: NextConfig = {
  // Lets phones on the same Wi-Fi load the dev server by LAN IP.
  allowedDevOrigins: ['*.local', '192.168.*.*', '10.*.*.*'],
  // The options route reads cached places JSON from disk at runtime; ship it with the serverless bundle.
  outputFileTracingIncludes: { '/api/options': ['./data/places/**'] },
};

export default nextConfig;
