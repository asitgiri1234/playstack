# syntax=docker/dockerfile:1
# Playstack API — multi-stage build.
#
# Build from the REPO ROOT (the compose file does):
#   docker build -f apps/api/Dockerfile .
#
# node:22-slim (Debian), not alpine, on purpose: bcrypt is a native module and
# Prisma ships query engines per libc — both have first-class glibc prebuilds,
# while musl/alpine is where "works on my machine" Docker builds go to die.

# --- Stage 1: build -----------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /repo

# Prisma engines need OpenSSL present even at generate time.
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# Workspace manifests first, so `npm ci` layer-caches until a dependency changes.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

RUN npm ci

# Source, then build: shared first (the api imports its dist), then the client,
# then the api itself. tsc emits dist/src/server.js AND dist/prisma/seed.js —
# the seed is compiled too so the runtime image can seed without tsx.
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/

RUN npm run build --workspace @playstack/shared \
 && npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build --workspace @playstack/api

# --- Stage 2: production dependencies only ------------------------------------
FROM node:22-slim AS proddeps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev

# --- Stage 3: runtime ---------------------------------------------------------
FROM node:22-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production

RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* \
 # Pinned to the version the lockfile resolves, so `migrate deploy` runs the
 # same engine the client was generated with. Global, because prisma is a
 # devDependency and does not belong in the app's production node_modules.
 && npm install -g prisma@6.19.3

# Production node_modules, with the GENERATED Prisma client layered on top —
# generation happened in the build stage (it needs the dev CLI).
COPY --from=proddeps /repo/node_modules ./node_modules
COPY --from=build /repo/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /repo/node_modules/@prisma/client ./node_modules/@prisma/client

# Only built artifacts and the schema/migrations — no TypeScript source.
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/packages/shared/package.json ./packages/shared/
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/
COPY --from=build /repo/apps/api/prisma/schema.prisma ./apps/api/prisma/schema.prisma
COPY --from=build /repo/apps/api/prisma/migrations ./apps/api/prisma/migrations
COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Non-root. The app owns nothing on disk it needs to write.
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && chown -R node:node /repo
USER node

WORKDIR /repo/apps/api
EXPOSE 4000

# The entrypoint applies committed migrations, seeds ONLY an empty database
# (SEED_ONLY_IF_EMPTY guard — a container restart must not wipe data), then
# starts the server.
ENTRYPOINT ["docker-entrypoint.sh"]
