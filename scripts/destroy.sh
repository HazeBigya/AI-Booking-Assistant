#!/usr/bin/env bash
# Deletes the database and everything in it. Separate from `npm run setup`
# on purpose: setup should never be able to lose your bookings.
#
# Usage:  npm run destroy          (asks for confirmation)
#         npm run destroy -- --yes (no prompt, for scripts)
set -euo pipefail

cd "$(dirname "$0")/.."

if [ "${1:-}" != "--yes" ]; then
  echo "This deletes the Postgres volume: every booking, patient and login code."
  echo "The clinic's dentists and services are re-created by 'npm run setup'."
  echo
  # A destructive default must not be reachable by pressing Enter, and a
  # non-interactive shell must abort rather than inherit a blank answer.
  printf "Type 'destroy' to confirm: "
  read -r answer || answer=""
  if [ "$answer" != "destroy" ]; then
    echo "✗ Cancelled. Nothing was deleted."
    exit 1
  fi
fi

echo "→ Removing containers and the database volume..."
docker compose down -v

echo "✓ Database destroyed. Run 'npm run setup' to build a fresh one."
