#!/usr/bin/env bash
# Wipe, boot, migrate, and seed the database in one step.
# Usage: npm run db:reset
set -euo pipefail

echo "→ Removing existing database + volume..."
docker compose down -v

echo "→ Starting Postgres (waiting until healthy)..."
docker compose up -d --wait db

echo "→ Applying migrations..."
npm run db:migrate

echo "→ Seeding data..."
npm run db:seed

echo "✓ Database reset, migrated, and seeded."
