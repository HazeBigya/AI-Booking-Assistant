#!/usr/bin/env bash
# One-command setup: prepares a clean database, applies the schema, and loads
# the clinic's data. Usage: npm run setup
set -euo pipefail

echo "→ Preparing a clean database..."
docker compose down -v

echo "→ Starting Postgres (waiting until ready)..."
docker compose up -d --wait db

echo "→ Applying the database schema..."
npm run db:migrate

echo "→ Loading clinic data (dentists, services)..."
npm run db:seed

echo "→ Running tests to verify everything..."
npm test

echo "✓ Setup complete and verified. Now run: npm run dev"
