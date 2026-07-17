/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The shared package ships TypeScript source, so Next must compile it rather
  // than treat it as a prebuilt node_modules dependency. This is what lets the
  // UI import the permission matrix directly from packages/shared.
  transpilePackages: ['@playstack/shared'],
  eslint: {
    // Linting is a root-level concern here; `npm run lint` covers the monorepo.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
