# Coattail / polymarket-copy-bot — instructions for Claude Code

## ALWAYS do these when you work here

1. **Any edit to `src/versions.ts` or `src/config.ts` requires a site sync.**
   After you finish the edit, run `./scripts/deploy.sh` (or `git ship` alias).
   The deploy script pushes to GitHub, pulls on Hetzner, restarts the bot, and deploys Netlify.
   Data on `coattail.me/performance` is fetched live from the Hetzner API — restart is required for new MK versions to appear.

2. **Never hardcode fallback data on the performance page.**
   `landing/app/performance/page.tsx` must show real API data or explicit "insufficient sample" / "re-baselining" banners.
   Fake placeholder numbers actively mislead paying subscribers.

3. **Never mark an MK version `status: "deployed"` without sample size ≥ 20 resolved.**
   Set `testing` until `sim_metrics` shows enough resolutions.
   Max's guide: "Get things working first — don't jump to packaging before core works" (memory: feedback_stop_jumping_steps).

4. **Trader roster is refreshed 3x/day by launchd.**
   `com.max.coattail-trader-refresh` runs `scripts/refresh-traders.ts --json` at 6am/12pm/6pm ET, writes to `data/latest-roster.json`.
   To promote a WATCH trader to CORE: manually edit `src/config.ts` after reviewing 3 days of their signals.

5. **Db files are gitignored — do NOT `git add` `copybot.db*`.**
   The DB got corrupted twice in April when WAL files were committed. Permanent guard: `.gitignore` covers `copybot*.db*`.

6. **When pausing/resuming the bot:**
   Local Mac:  `launchctl unload|load ~/Library/LaunchAgents/com.max.polymarket-bot-v2.plist`
   Hetzner:    `ssh jarvis 'systemctl stop|start polymarket-bot polymarket-dashboard'`
   Never just `kill` — launchd respawns.

## Known bugs

- **Mirror-sell match failure.** `src/bot.ts:289` calls `getPositions()` and matches on slug+outcome. Live DB shows 54 real BUYs vs 3 real SELLs since Friday — 719 sell signals fell through because the lookup didn't match. Likely slug format mismatch between tracker signal and Bullpen position list. Instrument before touching.

- **Resolution tracker gap.** Some traders have 20-190 trades in `trades` table but 0 rows in `resolutions`. Root cause unknown (maybe slug normalization). `trader_stats` `resolved_trades` is the source of truth — treat "0 resolved" traders as untrustworthy regardless of signal count.

- **Polymarket leaderboard `win_rate: null` on CLI.** The `bullpen polymarket data leaderboard` command returns null WR. Use `bullpen polymarket data smart-money --type top_traders` for real WR data (requires `bullpen experimental enable prediction_analytics`).

## Auth

- Bullpen JWT expires ~30-60 min. Auto-reauth scripts don't work (Vercel blocks Playwright).
- Town hall with @ernest 2026-04-21 to request persistent API key.
- Running bot on Mac (not Hetzner) while auth is unresolved — Hetzner limited to paper mode.

## File map

```
src/config.ts           — traders + filters + risk (edit this when rosterchanges)
src/versions.ts         — MK version defs (edit this when adding a new strategy)
src/bot.ts              — main loop, buy/sell handlers
src/executor.ts         — Bullpen CLI wrapper (buy/sell/positions/balance)
src/filters.ts          — signal filters (price, noise, dedup, new-position-only)
src/tracker.ts          — pulls trade feed from Bullpen tracker
src/trader-stats.ts     — per-trader WR/EV computation
src/resolution-tracker.ts — polls Polymarket for resolved markets
src/sim-engine.ts       — multi-version paper engine (evaluates all MKs per signal)
src/metrics.ts          — computes sim_metrics (win_rate, sharpe, etc)
src/dashboard.ts        — serves /api/* endpoints
landing/app/             — Next.js site (performance page + welcome + terms)
scripts/refresh-traders.ts — daily leaderboard refresh (advisory mode default)
scripts/deploy.sh       — one-command push + restart + deploy
```

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **polymarket-copy-bot** (5901 symbols, 13746 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/polymarket-copy-bot/context` | Codebase overview, check index freshness |
| `gitnexus://repo/polymarket-copy-bot/clusters` | All functional areas |
| `gitnexus://repo/polymarket-copy-bot/processes` | All execution flows |
| `gitnexus://repo/polymarket-copy-bot/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
