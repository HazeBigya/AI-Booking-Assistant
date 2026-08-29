#!/usr/bin/env bash
# Builds the database and loads the clinic's data. Safe to re-run: it never
# deletes anything, and seeding skips when the clinic data is already there.
# To wipe and start over, run 'npm run destroy' first.
#
# Usage:  npm run setup
set -euo pipefail

cd "$(dirname "$0")/.."

if ! docker info >/dev/null 2>&1; then
  echo "✗ Docker isn't running. Start Docker Desktop, then run this again."
  exit 1
fi

echo "→ Starting Postgres (waiting until it accepts connections)..."
docker compose up -d --wait db

echo "→ Applying the database schema..."
npm run db:migrate

echo "→ Loading clinic data (dentists, services)..."
npm run db:seed

echo "→ Running tests to verify everything..."
npm test

echo "✓ Setup complete and verified. Now run: npm run start:all"
