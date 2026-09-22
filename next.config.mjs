/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Required for Docker standalone deployment (emits server.js + self-contained assets)
  output: "standalone",
};

export default nextConfig;
