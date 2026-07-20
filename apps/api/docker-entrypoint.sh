#!/bin/sh
# Playstack API container entrypoint.
# Order matters: schema first, data second, traffic last.
set -e

echo "[entrypoint] applying migrations"
# `migrate deploy` applies committed migrations only — it never generates or
# prompts, which is exactly what an unattended container needs.
prisma migrate deploy --schema prisma/schema.prisma

echo "[entrypoint] seeding (only if the database is empty)"
# The guard lives in the seed itself: with SEED_ONLY_IF_EMPTY=true it exits
# without touching a database that already has employees, so restarting the
# container never resets demo data.
SEED_ONLY_IF_EMPTY=true node dist/prisma/seed.js

echo "[entrypoint] starting api"
exec node dist/src/server.js
