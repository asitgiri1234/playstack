# syntax=docker/dockerfile:1
# Playstack web — Next.js standalone, multi-stage.
#
# Build from the REPO ROOT (the compose file does):
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=http://localhost:4000 .
#
# NEXT_PUBLIC_* vars are inlined into the browser bundle AT BUILD TIME — they
# are not runtime configuration. Changing the API origin means rebuilding.

# --- Stage 1: build -----------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/

RUN npm ci

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/

ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
# DOCKER_STANDALONE flips next.config to output:'standalone' — see the comment
# there for why it is not unconditional.
ENV DOCKER_STANDALONE=1
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build --workspace @playstack/shared \
 && npm run build --workspace @playstack/web

# --- Stage 2: runtime ---------------------------------------------------------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# The standalone output is a self-contained server: server.js plus exactly the
# node_modules the tracer proved are needed. With outputFileTracingRoot at the
# monorepo top, the bundle mirrors the repo layout (apps/web/server.js).
COPY --from=build /repo/apps/web/.next/standalone ./
# Static assets are NOT traced into standalone; they ship separately.
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static

RUN chown -R node:node /app
USER node

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "apps/web/server.js"]
