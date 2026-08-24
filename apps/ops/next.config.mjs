/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source, so Next compiles them itself.
  transpilePackages: ['@reservai/core', '@reservai/db', '@reservai/config'],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
