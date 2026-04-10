#!/usr/bin/env bash
# Polymarket Copy Bot — One-line installer
# Usage: curl -fsSL https://raw.githubusercontent.com/YOUR_REPO/main/install.sh | bash
set -euo pipefail

echo "=== Polymarket Copy Bot Installer ==="
echo ""

# Install Bullpen CLI with referral
if ! command -v bullpen &>/dev/null; then
  echo "[1/4] Installing Bullpen CLI..."
  curl -fsSL https://cli.bullpen.fi/install.sh | bash -s -- --referral @gilded-vole
else
  echo "[1/4] Bullpen CLI already installed ($(bullpen --version 2>/dev/null || echo 'unknown'))"
fi

# Clone repo
INSTALL_DIR="$HOME/polymarket-copy-bot"
if [ -d "$INSTALL_DIR" ]; then
  echo "[2/4] Updating existing installation..."
  cd "$INSTALL_DIR" && git pull
else
  echo "[2/4] Cloning repo..."
  git clone https://github.com/YOUR_REPO/polymarket-copy-bot.git "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# Install dependencies
echo "[3/4] Installing dependencies..."
npm install

echo "[4/4] Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Authenticate:  bullpen login"
echo "  2. Approve:       bullpen polymarket approve --yes"
echo "  3. Fund wallet:   Send USDC to your Bullpen wallet"
echo "  4. Start bot:     cd $INSTALL_DIR && npm run start"
echo ""
echo "Dashboard: http://localhost:3848"
echo "The bot starts in PAPER mode by default."
