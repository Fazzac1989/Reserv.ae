/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source, so Next compiles them itself.
  transpilePackages: ['@reservai/core', '@reservai/db', '@reservai/config'],
  eslint: { ignoreDuringBuilds: true },

  // The console lives under reserv.ae/admin so customers get the bare domain.
  // Next then writes every link, asset and form action under this prefix,
  // which is what lets the customer app forward /admin straight through.
  basePath: '/admin',

  experimental: {
    serverActions: {
      // Every form in the console is a Server Action, and Next refuses one
      // whose Origin does not match the host it was served from. Behind the
      // forwarding the browser says reserv.ae while this app sees its own
      // Vercel hostname, so without naming the domain here every approval and
      // every venue edit fails as an invalid request.
      allowedOrigins: ['reserv.ae', 'www.reserv.ae'],
    },
  },
};

export default nextConfig;
