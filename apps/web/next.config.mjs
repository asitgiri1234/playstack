/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No transpilePackages for @playstack/shared: it is consumed as its built
  // dist via the workspace symlink, which is already plain JS. Compiling its
  // source here would make webpack choke on shared's explicit './x.js' ESM
  // specifiers. Run `npm run build:shared` first — the root scripts do.
  eslint: {
    // Linting is a root-level concern here; `npm run lint` covers the monorepo.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
