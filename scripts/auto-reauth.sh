#!/bin/bash
# Auto-reauth — detects Bullpen auth failure on Hetzner, generates a code,
# and uses your Mac's Chrome (already logged in) to auto-approve it.
# Run on your Mac with laptop open. Checks every 5 minutes.

BULLPEN_REMOTE="/root/.bullpen/bin/bullpen"
LOG="$HOME/Desktop/polymarket-copy-bot/auto-reauth.log"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG"; }

while true; do
  # Check if Hetzner auth is alive
  STATUS=$(ssh -o ConnectTimeout=5 jarvis "$BULLPEN_REMOTE status --output json 2>&1" 2>/dev/null)

  if echo "$STATUS" | grep -qi "not logged in\|re-auth required\|invalid refresh\|unauthorized"; then
    log "AUTH DEAD — starting auto-reauth"

    # Generate a new login code on Hetzner
    ssh jarvis "killall bullpen 2>/dev/null; sleep 1; nohup $BULLPEN_REMOTE login --no-browser > /tmp/auto-reauth.log 2>&1 & disown" 2>/dev/null
    sleep 6

    # Extract the code
    CODE=$(ssh jarvis "cat /tmp/auto-reauth.log 2>/dev/null" | grep -oE '[A-Z]{4}-[A-Z]{4}')

    if [ -z "$CODE" ]; then
      log "FAIL — could not extract login code"
      sleep 300
      continue
    fi

    log "Got code: $CODE — opening browser to approve"

    # Open the device auth page in Chrome (already logged in)
    open "https://app.bullpen.fi/device" 2>/dev/null

    # Wait for page to load, then use AppleScript to type the code
    sleep 4
    osascript -e "
      tell application \"Google Chrome\"
        activate
        delay 2
        -- Type the code into the input field
        tell application \"System Events\"
          keystroke \"$CODE\"
          delay 1
          keystroke return
        end tell
      end tell
    " 2>/dev/null

    log "Submitted code $CODE — waiting for approval"
    sleep 15

    # Close the tab we opened (prevent tab spam)
    sleep 3
    osascript -e '
      tell application "Google Chrome"
        set windowList to every window
        repeat with w in windowList
          set tabList to every tab of w
          repeat with t in tabList
            if URL of t contains "bullpen.fi/device" then
              close t
            end if
          end repeat
        end repeat
      end tell
    ' 2>/dev/null

    # Verify it worked — check for "Status:           Logged in" (not "Not logged in")
    NEW_STATUS=$(ssh -o ConnectTimeout=5 jarvis "$BULLPEN_REMOTE status 2>&1" 2>/dev/null)
    if echo "$NEW_STATUS" | grep -q "Status:           Logged in"; then
      log "SUCCESS — auth restored"
      ssh jarvis "systemctl restart polymarket-bot" 2>/dev/null
      log "Bot restarted"
    else
      log "FAIL — auto-approve didn't work. Will retry next cycle."
    fi
  else
    log "AUTH OK"
  fi

  sleep 300  # Check every 5 minutes
done
