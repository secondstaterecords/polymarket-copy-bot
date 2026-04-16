#!/bin/bash
set -e

# ── Polymarket Copy Bot — Installer ──────────────────────────────────
CYAN='\033[0;36m'; GREEN='\033[0;32m'; RED='\033[0;31m'; DIM='\033[2m'; BOLD='\033[1m'; NC='\033[0m'
BOT_DIR="$HOME/polymarket-copy-bot"
REFERRAL="gilded-vole"

echo ""
echo -e "${CYAN}${BOLD}  POLYMARKET COPY BOT${NC}"
echo -e "${DIM}  Automated prediction market trading${NC}"
echo ""

# ── Check prerequisites ──────────────────────────────────────────────
echo -e "${CYAN}[1/5]${NC} Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js not found.${NC} Install: https://nodejs.org (v18+)"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} Node.js $(node -v)"

if ! command -v git &> /dev/null; then
    echo -e "${RED}Git not found.${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} Git"

# Find or install Bullpen
BULLPEN_PATH=""
for p in "$(which bullpen 2>/dev/null)" "$HOME/.local/bin/bullpen" "$HOME/.bullpen/bin/bullpen"; do
    if [ -f "$p" ]; then BULLPEN_PATH="$p"; break; fi
done

if [ -z "$BULLPEN_PATH" ]; then
    echo -e "  ${DIM}Installing Bullpen CLI...${NC}"
    curl -fsSL https://cli.bullpen.fi/install.sh | bash 2>/dev/null || curl -fsSL https://bullpen.fi/install.sh | bash 2>/dev/null
    for p in "$HOME/.local/bin/bullpen" "$HOME/.bullpen/bin/bullpen"; do
        if [ -f "$p" ]; then BULLPEN_PATH="$p"; break; fi
    done
    if [ -z "$BULLPEN_PATH" ]; then echo -e "${RED}Bullpen install failed.${NC}"; exit 1; fi
fi
echo -e "  ${GREEN}✓${NC} Bullpen CLI"

# ── Clone or update ──────────────────────────────────────────────────
echo -e "${CYAN}[2/5]${NC} Getting bot code..."
if [ -d "$BOT_DIR" ]; then
    cd "$BOT_DIR" && git pull --ff-only 2>/dev/null || true
else
    git clone https://github.com/secondstaterecords/polymarket-copy-bot.git "$BOT_DIR"
    cd "$BOT_DIR"
fi
npm install --silent 2>/dev/null
echo -e "  ${GREEN}✓${NC} Ready"

# ── Bullpen login ────────────────────────────────────────────────────
echo -e "${CYAN}[3/5]${NC} Bullpen login..."

# Skip login if already authenticated
if $BULLPEN_PATH polymarket preflight --output json 2>/dev/null | grep -q "balance_usd"; then
    echo -e "  ${GREEN}✓${NC} Already logged in"
else
    # Open signup page with referral link baked in
    SIGNUP_URL="https://bullpen.fi/@${REFERRAL}"
    echo ""
    echo -e "  ${BOLD}Step 1: Create your Bullpen account${NC}"
    echo -e "  Opening ${CYAN}${SIGNUP_URL}${NC} ..."
    echo ""
    open "$SIGNUP_URL" 2>/dev/null || xdg-open "$SIGNUP_URL" 2>/dev/null || echo -e "  Open this URL manually: ${CYAN}${SIGNUP_URL}${NC}"
    echo ""
    echo -e "  ${BOLD}Sign up in the browser, then come back here.${NC}"
    echo -e "  ${DIM}(The referral is already included in the link)${NC}"
    echo ""
    read -p "  Press Enter when you've created your account..." </dev/tty
    echo ""
    echo -e "  ${BOLD}Step 2: Log in via terminal${NC}"
    echo ""
    $BULLPEN_PATH login </dev/tty || true
fi

# Approve trading
echo -e "  ${DIM}Approving trading permissions...${NC}"
$BULLPEN_PATH polymarket approve --yes 2>/dev/null || true

# Check balance
BAL=$($BULLPEN_PATH polymarket preflight --output json 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin).get('balance_usd','$0.00'))" 2>/dev/null || echo "unknown")
echo -e "  ${GREEN}✓${NC} Logged in — Balance: ${GREEN}${BAL}${NC}"

# ── Configure ────────────────────────────────────────────────────────
echo -e "${CYAN}[4/5]${NC} Configuring..."

# Write bot-status.json for paper mode
echo '{"running":true,"paperMode":true}' > "$BOT_DIR/bot-status.json"
echo -e "  ${GREEN}✓${NC} Paper mode enabled (safe — no real money used)"

# ── Auto-start services ──────────────────────────────────────────────
echo -e "${CYAN}[5/5]${NC} Setting up auto-start..."

NODE_BIN=$(dirname "$(which node)")
AGENT_DIR="$HOME/Library/LaunchAgents"
mkdir -p "$AGENT_DIR"

# Bot
cat > "$AGENT_DIR/com.copybot.bot.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>com.copybot.bot</string>
    <key>ProgramArguments</key>
    <array><string>${NODE_BIN}/npx</string><string>tsx</string><string>src/bot.ts</string></array>
    <key>WorkingDirectory</key><string>${BOT_DIR}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>BULLPEN_PATH</key><string>${BULLPEN_PATH}</string>
        <key>PATH</key><string>${NODE_BIN}:$(dirname ${BULLPEN_PATH}):/usr/local/bin:/usr/bin:/bin</string>
    </dict>
    <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>${BOT_DIR}/bot.log</string>
    <key>StandardErrorPath</key><string>${BOT_DIR}/bot-error.log</string>
</dict>
</plist>
EOF

# Dashboard
cat > "$AGENT_DIR/com.copybot.dashboard.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>com.copybot.dashboard</string>
    <key>ProgramArguments</key>
    <array><string>${NODE_BIN}/npx</string><string>tsx</string><string>src/dashboard.ts</string></array>
    <key>WorkingDirectory</key><string>${BOT_DIR}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>BULLPEN_PATH</key><string>${BULLPEN_PATH}</string>
        <key>PATH</key><string>${NODE_BIN}:$(dirname ${BULLPEN_PATH}):/usr/local/bin:/usr/bin:/bin</string>
    </dict>
    <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>${BOT_DIR}/dashboard.log</string>
    <key>StandardErrorPath</key><string>${BOT_DIR}/dashboard-error.log</string>
</dict>
</plist>
EOF

launchctl load "$AGENT_DIR/com.copybot.bot.plist" 2>/dev/null
launchctl load "$AGENT_DIR/com.copybot.dashboard.plist" 2>/dev/null

sleep 3
echo -e "  ${GREEN}✓${NC} Services started"

echo ""
echo -e "${GREEN}${BOLD}  ✓ SETUP COMPLETE${NC}"
echo ""
echo -e "  ${BOLD}Dashboard:${NC}  ${CYAN}http://localhost:3848${NC}"
echo -e "  ${BOLD}Status:${NC}     Paper mode (no real money)"
echo -e "  ${BOLD}Logs:${NC}       ${DIM}~/polymarket-copy-bot/bot.log${NC}"
echo ""
echo -e "  ${BOLD}To go live:${NC}"
echo -e "    1. Deposit USDC at ${CYAN}app.bullpen.fi/wallet${NC}"
echo -e "    2. Edit ~/polymarket-copy-bot/src/config.ts"
echo -e "       Change ${RED}paperMode: true${NC} → ${GREEN}paperMode: false${NC}"
echo -e "    3. Restart: launchctl unload ~/Library/LaunchAgents/com.copybot.bot.plist"
echo -e "                launchctl load ~/Library/LaunchAgents/com.copybot.bot.plist"
echo ""
echo -e "  ${BOLD}To update:${NC}  cd ~/polymarket-copy-bot && git pull && npm install"
echo ""
