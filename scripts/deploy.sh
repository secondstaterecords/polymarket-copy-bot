#!/bin/bash
# Deploy Coattail — pushes code to Hetzner + Netlify
# Usage: ./scripts/deploy.sh [--bot-only | --site-only | --all]

set -e

MODE="${1:---all}"

echo "🔄 Deploying Coattail..."

# Push to GitHub
git push origin main 2>/dev/null && echo "✅ Pushed to GitHub" || echo "⚠️  Git push failed (maybe nothing to push)"

if [[ "$MODE" == "--bot-only" || "$MODE" == "--all" ]]; then
  echo ""
  echo "📡 Updating Hetzner bot..."
  ssh jarvis "cd /root/polymarket-copy-bot && git pull origin main && systemctl restart polymarket-bot && systemctl restart polymarket-dashboard && echo '✅ Bot + Dashboard restarted'"
fi

if [[ "$MODE" == "--site-only" || "$MODE" == "--all" ]]; then
  echo ""
  echo "🌐 Deploying to Netlify..."
  cd "$(dirname "$0")/../landing"
  netlify deploy --prod 2>&1 | grep -E "Deploy is live|Error|✔|✗" || true
  echo "✅ Netlify deploy complete"
fi

echo ""
echo "🎯 Deploy complete!"
echo "   Bot API: http://178.104.84.77:3848/api/public/performance"
echo "   Website: https://coattail.me/performance"
