#!/usr/bin/env bash
# Double-click this file in Finder to run the whole app.
# It just calls the start script and keeps the window open on exit.
cd "$(dirname "$0")"
bash scripts/start.sh
echo
echo "Press Enter to close this window."
read -r _
