#!/bin/bash
# Auth keep-alive — runs `bullpen status` every 5 min to force token refresh.
# Bullpen access tokens expire in ~1-4hr but refresh silently when the CLI is actively used.
# This keeps the refresh chain alive so the session doesn't silently die between trades.

BULLPEN="${BULLPEN_PATH:-$HOME/.local/bin/bullpen}"
LOG="$HOME/Desktop/polymarket-copy-bot/auth-keepalive.log"

while true; do
  TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  OUT=$($BULLPEN status --output json 2>&1)
  if echo "$OUT" | grep -qi "not logged in\|unauthorized\|invalid refresh\|re-auth required"; then
    echo "$TS [FAIL] Auth broken: $(echo "$OUT" | head -1)" >> "$LOG"
  else
    # Just extract the auth-ok signal
    echo "$TS [OK] Auth alive" >> "$LOG"
  fi
  sleep 300  # 5 minutes
done
