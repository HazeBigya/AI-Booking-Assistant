#!/usr/bin/env bash
# One command to run EVERYTHING (macOS): starts Docker Desktop if needed, then
# launches Postgres + migrations + seed + the app in containers.
#
#   Postgres  -> database (container)
#   migrate   -> applies schema + loads clinic data, then exits
#   app       -> the website + booking API on http://localhost:3000
#
# Usage:  npm run start:all   (or double-click start.command in Finder)
set -euo pipefail

cd "$(dirname "$0")/.."

# 1. Docker must be installed.
if ! command -v docker >/dev/null 2>&1; then
  echo "✗ Docker is not installed."
  echo "  Install Docker Desktop for Mac, then run this again:"
  echo "  https://www.docker.com/products/docker-desktop/"
  exit 1
fi

# 2. First run: create .env from the template so the app has settings.
if [ ! -f .env ]; then
  echo "→ No .env found — creating one from .env.example."
  cp .env.example .env
  echo
  echo "✗ Before continuing, open the new '.env' file and add at least one AI key"
  echo "  (e.g. DEEPSEEK_API_KEY or OPENAI_API_KEY). Then run this again."
  exit 1
fi

# 3. Start the Docker engine if it isn't running yet.
if ! docker info >/dev/null 2>&1; then
  echo "→ Starting Docker Desktop..."
  open -a Docker
  echo -n "  Waiting for Docker to be ready"
  # Give it up to ~2 minutes to boot.
  for _ in $(seq 1 60); do
    if docker info >/dev/null 2>&1; then break; fi
    echo -n "."
    sleep 2
  done
  echo
  if ! docker info >/dev/null 2>&1; then
    echo "✗ Docker did not start in time. Open Docker Desktop manually, wait for"
    echo "  the whale icon to stop animating, then run this again."
    exit 1
  fi
fi

echo "✓ Docker is ready. Building and starting everything..."
echo "  (first run downloads images + builds — this can take a few minutes)"
echo

# 4. Build + run the whole stack in the foreground so logs are visible.
#    Ctrl-C stops it. Data persists between runs (see 'npm run reset' to wipe).
docker compose up --build

echo
echo "Stopped. The app was at http://localhost:3000"
