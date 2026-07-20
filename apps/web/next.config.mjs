// Explicit builtin imports (rather than the ambient globals) so the flat
// eslint config's no-undef — which has no Node environment configured for
// plain .mjs — can resolve them.
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

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
  // Standalone output ONLY for the Docker image (set via build arg): it emits a
  // self-contained server.js + pruned node_modules that `next start` cannot
  // serve, so enabling it unconditionally would break the local
  // `npm run build && npm run start` flow.
  ...(process.env.DOCKER_STANDALONE === '1' ? { output: 'standalone' } : {}),
  // In a monorepo, file tracing must root at the workspace top or the
  // standalone bundle misses hoisted node_modules.
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
};

export default nextConfig;
