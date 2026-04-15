import http from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import Database from "better-sqlite3";

const DATA_DIR = process.env.DATA_DIR || ".";
const PORT = parseInt(process.env.DASHBOARD_PORT || "3848");
const DB_PATH = join(DATA_DIR, "copybot.db");

function readJson(file: string): any {
  const p = join(DATA_DIR, file);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf-8")); } catch { return null; }
}

// ── V1 data reader ─────────────────────────────────────────────────
function v1Data(): any {
  const tradesFile = join(DATA_DIR, "trades.json");
  let allTrades: any[] = [];
  if (existsSync(tradesFile)) {
    try { allTrades = JSON.parse(readFileSync(tradesFile, "utf-8")); } catch {}
  }
  const success = allTrades.filter((t: any) => t.status === "success");
  const skipped = allTrades.filter((t: any) => t.status === "skipped");
  const failed = allTrades.filter((t: any) => t.status === "failed");

  // Compute basic P&L from successful trades
  let invested = 0;
  const positions: any[] = [];
  for (const t of success) {
    if (t.action === "BUY") {
      const amt = parseFloat(t.ourAmount || t.our_amount || "0") || 5;
      const entry = parseFloat(t.entryPrice || t.entry_price || "0");
      invested += amt;
      positions.push({
        slug: t.slug, outcome: t.outcome, trader: t.trader,
        entry, shares: entry > 0 ? amt / entry : 0, amount: amt,
      });
    }
  }

  return {
    trades: success.slice(-50).reverse(),
    stats: { executed: success.length, filtered: skipped.length, failed: failed.length, total: allTrades.length },
    positions,
    invested,
    firstTradeTime: success.length > 0 ? success[0].timestamp : null,
  };
}

function getDb(): Database.Database | null {
  if (!existsSync(DB_PATH)) return null;
  try { return new Database(DB_PATH, { readonly: true }); } catch { return null; }
}

// ── P&L history for chart (persisted to disk) ─────────────────────
const PNL_HISTORY_FILE = join(DATA_DIR, "pnl-history.json");
const MAX_HISTORY = 4320; // 6 hours at 5s intervals
let pnlHistory: Array<{ t: number; pnl: number }> = [];

// Load persisted history on startup
try {
  if (existsSync(PNL_HISTORY_FILE)) {
    pnlHistory = JSON.parse(readFileSync(PNL_HISTORY_FILE, "utf-8"));
  }
} catch {}

function savePnlHistory(): void {
  try { writeFileSync(PNL_HISTORY_FILE, JSON.stringify(pnlHistory)); } catch {}
}

// ── Bullpen portfolio (actual source of truth) ────────────────────
interface PortfolioCache { ts: number; data: any }
let portfolioCache: PortfolioCache | null = null;
const PORTFOLIO_TTL = 15_000; // refresh every 15s

function getPortfolio(): any {
  const now = Date.now();
  if (portfolioCache && now - portfolioCache.ts < PORTFOLIO_TTL) return portfolioCache.data;

  try {
    const { execSync } = require("child_process");
    const BULLPEN = process.env.BULLPEN_PATH || `${process.env.HOME}/.local/bin/bullpen`;

    // Get balance
    const preRaw = execSync(`${BULLPEN} polymarket preflight --output json 2>/dev/null`, { encoding: "utf-8", timeout: 15000 }).trim();
    const preStart = preRaw.indexOf("{"); const preEnd = preRaw.lastIndexOf("}");
    const pre = preStart >= 0 ? JSON.parse(preRaw.substring(preStart, preEnd + 1)) : {};
    const cash = parseFloat((pre.balance_usd || "$0").replace(/[^0-9.]/g, "")) || 0;

    // Get positions
    const posRaw = execSync(`${BULLPEN} polymarket positions --output json 2>/dev/null`, { encoding: "utf-8", timeout: 15000 }).trim();
    const posStart = posRaw.indexOf("{"); const posEnd = posRaw.lastIndexOf("}");
    const posData = posStart >= 0 ? JSON.parse(posRaw.substring(posStart, posEnd + 1)) : {};
    const summary = posData.summary || {};
    const positions = posData.positions || [];

    // Compute totals from positions (more reliable than summary)
    let totalInvested = 0, totalUPnl = 0, totalValue = 0;
    const mappedPositions = positions.map((p: any) => {
      const invested = parseFloat(p.invested_usd || "0");
      const upnl = parseFloat(p.unrealized_pnl || "0");
      const value = parseFloat(p.current_value || "0");
      totalInvested += invested;
      totalUPnl += upnl;
      totalValue += value;
      return {
        slug: p.slug || p.event_slug || "",
        outcome: p.outcome || "",
        market: p.market || "",
        entry: parseFloat(p.avg_price || "0"),
        current: parseFloat(p.current_price || "0"),
        shares: parseFloat(p.shares || "0"),
        value,
        invested,
        pnl: upnl,
        pnlPct: parseFloat(p.pnl_percent || "0"),
        endDate: p.end_date || "",
      };
    });

    const result = {
      cash,
      totalValue: cash + totalValue,
      positionsValue: totalValue,
      totalInvested,
      unrealizedPnl: totalUPnl,
      positionCount: positions.length,
      positions: mappedPositions,
    };
    portfolioCache = { ts: now, data: result };
    return result;
  } catch {
    return portfolioCache?.data || { cash: 0, totalValue: 0, positionsValue: 0, unrealizedPnl: 0, positionCount: 0, positions: [] };
  }
}

function apiData(): any {
  const db = getDb();
  let trades: any[] = [];
  let stats = { executed: 0, filtered: 0, failed: 0, sells: 0, total: 0 };
  let traderStats: Record<string, { trades: number; pnl: number }> = {};
  let firstTradeTime: string | null = null;
  let circuitBreaker = false;
  let dailyCapHit = false;

  if (db) {
    try {
      trades = db.prepare("SELECT * FROM trades ORDER BY id DESC LIMIT 200").all();
      const countRow = (status: string, extra = "") =>
        (db.prepare(`SELECT COUNT(*) as c FROM trades WHERE status = ? ${extra}`).get(status) as any)?.c || 0;
      stats.executed = countRow("success", "AND is_real = 1");
      stats.filtered = countRow("filtered");
      stats.failed = countRow("failed");
      stats.sells = (db.prepare("SELECT COUNT(*) as c FROM trades WHERE action = 'SELL'").get() as any)?.c || 0;
      stats.total = (db.prepare("SELECT COUNT(*) as c FROM trades").get() as any)?.c || 0;

      // First trade timestamp for uptime
      const first = db.prepare("SELECT MIN(timestamp) as ts FROM trades WHERE is_real = 1 AND status = 'success'").get() as any;
      firstTradeTime = first?.ts || null;

      // Detect circuit breaker / daily cap from recent filtered trades
      const recentFiltered = db.prepare(
        "SELECT error FROM trades WHERE status = 'filtered' ORDER BY id DESC LIMIT 5"
      ).all() as any[];
      for (const r of recentFiltered) {
        if (r.error?.includes("circuit breaker")) circuitBreaker = true;
        if (r.error?.includes("daily cap")) dailyCapHit = true;
      }

      // Per-trader stats from real successful trades
      const traderRows = db.prepare(
        "SELECT trader, COUNT(*) as cnt FROM trades WHERE is_real = 1 AND status = 'success' GROUP BY trader"
      ).all() as any[];
      for (const r of traderRows) {
        traderStats[r.trader] = { trades: r.cnt, pnl: 0 };
      }
    } finally {
      db.close();
    }
  }

  const realPnl = readJson("real-pnl.json") || { pnl: 0, invested: 0, returnPct: 0, positions: [] };
  const status = readJson("bot-status.json") || { running: false, paperMode: false };

  // Assign per-trader P&L from positions
  for (const pos of (realPnl.positions || [])) {
    if (pos.trader && traderStats[pos.trader]) {
      traderStats[pos.trader].pnl += pos.pnl;
    }
  }

  // Get actual portfolio from Bullpen
  const portfolio = getPortfolio();

  // Track P&L history (using real Bullpen portfolio uPNL, persisted to disk)
  const now = Date.now();
  const currentPnl = portfolio.unrealizedPnl;
  if (pnlHistory.length === 0 || now - pnlHistory[pnlHistory.length - 1].t >= 4000) {
    pnlHistory.push({ t: now, pnl: currentPnl });
    if (pnlHistory.length > MAX_HISTORY) pnlHistory.shift();
    if (pnlHistory.length % 12 === 0) savePnlHistory(); // Save every ~1 min
  }

  return {
    running: status.running,
    trades,
    realPnl,
    portfolio,
    stats,
    traderStats,
    firstTradeTime,
    circuitBreaker,
    dailyCapHit,
    pnlHistory: pnlHistory.map(h => ({ t: h.t, pnl: h.pnl })),
  };
}

// ── HTML ────────────────────────────────────────────────────────────

function html(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Polymarket Copy Bot</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Outfit:wght@300;400;500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#06080c;--surface:#0c1017;--card:#111822;--border:#1a2332;--border-hi:#253040;
  --text:#e8edf4;--dim:#5a6a7e;--muted:#3a4a5e;
  --cyan:#00e5cc;--cyan-dim:rgba(0,229,204,.12);
  --green:#00d68f;--green-dim:rgba(0,214,143,.12);
  --red:#ff4d6a;--red-dim:rgba(255,77,106,.12);
  --amber:#ffb020;--amber-dim:rgba(255,176,32,.12);
}
html{background:var(--bg)}
body{font-family:'Outfit',sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
body::before{content:'';position:fixed;inset:0;background:radial-gradient(ellipse 80% 50% at 50% -20%,rgba(0,229,204,.05),transparent);pointer-events:none;z-index:0}
.shell{max-width:1400px;margin:0 auto;padding:20px 24px;position:relative;z-index:1}
.hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;padding-bottom:14px;border-bottom:1px solid var(--border)}
.hdr-left{display:flex;align-items:center;gap:14px}
.logo{font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:600;color:var(--cyan)}
.logo span{color:var(--dim);font-weight:400}
.pill{display:flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:500}
.pill-live{background:var(--green-dim);color:var(--green)}
.pill-live::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--green);animation:blink 2s infinite}
.pill-warn{background:var(--amber-dim);color:var(--amber)}
.pill-off{background:var(--red-dim);color:var(--red)}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
.hdr-right{display:flex;gap:8px;align-items:center}
.btn{padding:6px 16px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--dim);cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:500;transition:all .15s}
.btn:hover{border-color:var(--cyan);color:var(--cyan)}
.uptime{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--dim)}

.metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:14px}
.mc{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px 16px;position:relative;overflow:hidden}
.mc.accent{border-color:rgba(0,229,204,.25)}
.mc.accent::after{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--cyan),transparent)}
.mc .lb{font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.08em;font-weight:500;margin-bottom:5px}
.mc .vl{font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:700;letter-spacing:-.03em;line-height:1}
.mc .sb{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--dim);margin-top:3px}
.g{color:var(--green)}.r{color:var(--red)}.c{color:var(--cyan)}.d{color:var(--dim)}.a{color:var(--amber)}

.chart-wrap{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px 16px 10px;margin-bottom:14px}
.chart-title{font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.08em;font-weight:500;margin-bottom:8px}
.chart-title span{color:var(--text);font-family:'JetBrains Mono',monospace;margin-left:8px}
canvas{width:100%;height:140px;display:block}

.cols{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
.tw{background:var(--card);border:1px solid var(--border);border-radius:10px;overflow:hidden}
.tw-h{padding:12px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center}
.tw-h h3{font-size:12px;font-weight:600}.tw-h .cnt{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--dim);background:var(--surface);padding:2px 8px;border-radius:5px}
.tw-s{max-height:360px;overflow-y:auto}
table{width:100%;border-collapse:collapse;font-size:11px}
thead{position:sticky;top:0;background:var(--card);z-index:1}
thead th{text-align:left;padding:8px 10px;color:var(--muted);font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid var(--border)}
tbody td{padding:7px 10px;border-bottom:1px solid rgba(26,35,50,.5);font-size:11px}
tbody tr:hover{background:rgba(0,229,204,.02)}
.tag{display:inline-block;padding:2px 7px;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:600}
.tag-buy{background:var(--green-dim);color:var(--green)}.tag-sell{background:var(--red-dim);color:var(--red)}
.tag-success{background:var(--green-dim);color:var(--green)}.tag-filtered{background:rgba(90,106,126,.12);color:var(--dim)}
.mono{font-family:'JetBrains Mono',monospace}
.trunc{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.note{color:var(--muted);font-size:10px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
.trader-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;padding:12px}
.tc{background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:10px;text-align:center}
.tc .tn{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;margin-bottom:2px}
.tc .ts{font-size:10px;color:var(--dim)}
.footer{display:flex;justify-content:space-between;padding:10px 0;margin-top:6px;border-top:1px solid var(--border);font-size:10px;color:var(--muted);font-family:'JetBrains Mono',monospace}

@media(max-width:1024px){.metrics{grid-template-columns:repeat(3,1fr)}.cols{grid-template-columns:1fr}}
@media(max-width:640px){.metrics{grid-template-columns:repeat(2,1fr)}}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border-hi);border-radius:3px}
</style>
</head>
<body>
<div class="shell">

<div class="hdr">
  <div class="hdr-left">
    <div class="logo">POLYMARKET COPY BOT</div>
    <div class="pill pill-off" id="statusPill">OFFLINE</div>
    <div class="pill pill-warn" id="alertPill" style="display:none"></div>
  </div>
  <div class="hdr-right">
    <div class="uptime" id="uptime"></div>
    <button class="btn" onclick="ctrl('start')">START</button>
    <button class="btn" onclick="ctrl('stop')">STOP</button>
  </div>
</div>

<div class="metrics">
  <div class="mc accent"><div class="lb">Portfolio Value</div><div class="vl c" id="mTotal">—</div><div class="sb" id="mTotalSub">loading...</div></div>
  <div class="mc"><div class="lb">Unrealized P&L</div><div class="vl" id="mPnl">—</div><div class="sb" id="mPnlSub"></div></div>
  <div class="mc"><div class="lb">Open Positions</div><div class="vl" id="mPos">—</div><div class="sb" id="mPosSub"></div></div>
  <div class="mc"><div class="lb">Best Position</div><div class="vl g" id="mBest">—</div><div class="sb" id="mBestSub"></div></div>
  <div class="mc"><div class="lb">Worst Position</div><div class="vl r" id="mWorst">—</div><div class="sb" id="mWorstSub"></div></div>
</div>

<div class="chart-wrap">
  <div class="chart-title">P&L OVER TIME <span id="chartVal"></span></div>
  <canvas id="chart" height="140"></canvas>
</div>

<div class="cols">
  <div class="tw">
    <div class="tw-h"><h3>Positions</h3><span class="cnt" id="posCount">0</span></div>
    <div class="tw-s"><table><thead><tr><th>Market</th><th>Pick</th><th>Entry</th><th>Now</th><th>Value</th><th>P&L</th></tr></thead><tbody id="posBody"></tbody></table></div>
  </div>
  <div class="tw">
    <div class="tw-h"><h3>Bot Activity</h3><span class="cnt" id="botCount">0 trades</span></div>
    <div class="tw-s">
      <div class="stats" style="padding:12px;margin:0">
        <div class="mc"><div class="lb">V2 Trades</div><div class="vl g" id="sV2">0</div></div>
        <div class="mc"><div class="lb">V1 Trades</div><div class="vl g" id="sV1">0</div></div>
        <div class="mc"><div class="lb">Signals Seen</div><div class="vl d" id="sSig">0</div></div>
      </div>
      <div class="tw-h" style="padding:8px 16px"><h3>Trader Performance</h3></div>
      <div class="trader-grid" id="traderGrid"></div>
    </div>
  </div>
</div>

<div class="tw" style="margin-bottom:14px">
  <div class="tw-h"><h3>Recent Trades</h3><span class="cnt" id="logCount">0</span></div>
  <div class="tw-s" style="max-height:300px"><table><thead><tr><th>Time</th><th>Bot</th><th>Trader</th><th>Action</th><th>Market</th><th>Outcome</th><th>Price</th><th>Amount</th><th>Status</th></tr></thead><tbody id="tradeBody"></tbody></table></div>
</div>

<div class="footer"><span id="lastUpdate"></span><span>Auto-refreshes every 5s</span></div>
</div>

<script>
function pnl$(v){return(v>=0?'+':'-')+'$'+Math.abs(v).toFixed(2)}
function pc(v){return v>=0?'g':'r'}
function tag(c,t){return '<span class="tag tag-'+c+'">'+t+'</span>'}
function timeStr(ts){
  try{if(!ts)return'—';let d;
  if(typeof ts==='number'){d=ts>1e12?new Date(ts):new Date(ts*1000)}
  else if(typeof ts==='string'&&/^\\d+\\.?\\d*$/.test(ts)){const n=parseFloat(ts);d=n>1e12?new Date(n):new Date(n*1000)}
  else{d=new Date(ts)}
  if(isNaN(d.getTime()))return String(ts);
  return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  }catch{return String(ts)}
}
function resolves(ed){
  if(!ed)return'';
  const d=new Date(ed+'T23:59:59'),now=new Date(),diff=d-now;
  if(diff<-86400000)return'<span class="a">Awaiting</span>';
  if(diff<0)return'<span class="a">Today</span>';
  const h=Math.floor(diff/3.6e6);return h<24?'<span class="c">'+h+'h</span>':Math.floor(h/24)+'d';
}

// Chart
function drawChart(hist){
  const c=document.getElementById('chart'),ctx=c.getContext('2d');
  const dpr=devicePixelRatio||1,rect=c.getBoundingClientRect();
  c.width=rect.width*dpr;c.height=rect.height*dpr;ctx.scale(dpr,dpr);
  const W=rect.width,H=rect.height,pL=50,pR=14,pT=16,pB=24,cW=W-pL-pR,cH=H-pT-pB;
  ctx.clearRect(0,0,W,H);
  if(!hist||hist.length<2){ctx.fillStyle='#3a4a5e';ctx.font='12px JetBrains Mono';ctx.textAlign='center';ctx.fillText('Building chart data...',W/2,H/2);return}
  const vals=hist.map(h=>h.pnl),times=hist.map(h=>h.t);
  const mn=Math.min(...vals),mx=Math.max(...vals),pad=(mx-mn)*.15||.5,yMin=mn-pad,yMax=mx+pad,range=yMax-yMin;
  const last=vals[vals.length-1],color=last>=0?'#00d68f':'#ff4d6a';
  // Grid
  ctx.font='9px JetBrains Mono';ctx.textAlign='right';
  for(let i=0;i<=3;i++){const v=yMax-(i/3)*range,y=pT+(i/3)*cH;
    ctx.strokeStyle='#1a2332';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pL,y);ctx.lineTo(W-pR,y);ctx.stroke();
    ctx.fillStyle='#3a4a5e';ctx.fillText(pnl$(v),pL-4,y+3)}
  // Zero line
  if(yMin<=0&&yMax>=0){const zy=pT+((yMax-0)/range)*cH;ctx.strokeStyle='#253040';ctx.lineWidth=1;ctx.setLineDash([5,3]);ctx.beginPath();ctx.moveTo(pL,zy);ctx.lineTo(W-pR,zy);ctx.stroke();ctx.setLineDash([])}
  // Time labels
  ctx.textAlign='center';ctx.fillStyle='#3a4a5e';
  const lc=Math.min(4,Math.max(2,Math.floor(cW/130)));
  for(let i=0;i<lc;i++){const idx=Math.floor(i*(times.length-1)/(lc-1));const x=pL+(idx/(times.length-1))*cW;
    ctx.fillText(new Date(times[idx]).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),x,H-6)}
  // Duration
  const dur=Math.round((times[times.length-1]-times[0])/60000);
  ctx.textAlign='right';ctx.fillText((dur<60?dur+'m':Math.floor(dur/60)+'h '+dur%60+'m')+' window',W-pR,H-6);
  // Points
  const pts=vals.map((v,i)=>({x:pL+(i/(vals.length-1))*cW,y:pT+((yMax-v)/range)*cH}));
  // Fill
  const grad=ctx.createLinearGradient(0,pT,0,H-pB);
  grad.addColorStop(0,last>=0?'rgba(0,214,143,.15)':'rgba(255,77,106,.15)');grad.addColorStop(1,'transparent');
  ctx.beginPath();ctx.moveTo(pts[0].x,H-pB);for(const p of pts)ctx.lineTo(p.x,p.y);ctx.lineTo(pts[pts.length-1].x,H-pB);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
  // Line
  ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
  for(let i=1;i<pts.length;i++){if(pts.length>4){const xc=(pts[i-1].x+pts[i].x)/2,yc=(pts[i-1].y+pts[i].y)/2;ctx.quadraticCurveTo(pts[i-1].x,pts[i-1].y,xc,yc)}else ctx.lineTo(pts[i].x,pts[i].y)}
  if(pts.length>4)ctx.lineTo(pts[pts.length-1].x,pts[pts.length-1].y);
  ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();
  // End dot
  const lp=pts[pts.length-1];
  ctx.beginPath();ctx.arc(lp.x,lp.y,6,0,Math.PI*2);ctx.fillStyle=last>=0?'rgba(0,214,143,.12)':'rgba(255,77,106,.12)';ctx.fill();
  ctx.beginPath();ctx.arc(lp.x,lp.y,3,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
  ctx.fillStyle=color;ctx.font='bold 10px JetBrains Mono';ctx.textAlign='left';ctx.fillText(pnl$(last),lp.x+8,lp.y+3);
}

async function ctrl(a){await fetch('/api/'+a,{method:'POST'});refresh()}

async function refresh(){
  try{
    const [r1,r2]=await Promise.all([fetch('/api/data'),fetch('/api/v1')]);
    const d=await r1.json(),v1=await r2.json();
    const port=d.portfolio||{};
    const pos=port.positions||[];

    // Status
    const pill=document.getElementById('statusPill');
    pill.className='pill '+(d.running?'pill-live':'pill-off');pill.textContent=d.running?'LIVE':'OFFLINE';
    const ap=document.getElementById('alertPill');
    if(d.circuitBreaker){ap.style.display='flex';ap.textContent='CIRCUIT BREAKER'}
    else if(d.dailyCapHit){ap.style.display='flex';ap.textContent='DAILY CAP HIT'}
    else ap.style.display='none';

    // Uptime
    if(d.firstTradeTime){const ft=new Date(d.firstTradeTime).getTime();if(!isNaN(ft)){const ms=Date.now()-ft,s=Math.floor(ms/1000),m=Math.floor(s/60),h=Math.floor(m/60);document.getElementById('uptime').textContent=h>0?h+'h '+m%60+'m':m+'m'}}

    // Portfolio metrics
    const cash=port.cash||0,posVal=port.positionsValue||0,total=port.totalValue||0;
    const upnl=port.unrealizedPnl||0,invested=port.totalInvested||0;
    const ret=invested>0?Math.round(upnl/invested*10000)/100:0;
    document.getElementById('mTotal').textContent='$'+total.toFixed(2);
    document.getElementById('mTotalSub').textContent='$'+cash.toFixed(0)+' cash + $'+posVal.toFixed(0)+' positions';
    const mp=document.getElementById('mPnl');mp.textContent=pnl$(upnl);mp.className='vl '+pc(upnl);
    document.getElementById('mPnlSub').textContent=ret.toFixed(1)+'% on $'+invested.toFixed(0)+' invested';
    const wins=pos.filter(p=>(p.pnl||0)>0).length,losses=pos.filter(p=>(p.pnl||0)<0).length;
    document.getElementById('mPos').textContent=pos.length;
    document.getElementById('mPosSub').textContent=wins+'W '+losses+'L';

    // Best/worst
    if(pos.length>0){
      const sorted=[...pos].sort((a,b)=>(b.pnl||0)-(a.pnl||0));
      const best=sorted[0],worst=sorted[sorted.length-1];
      document.getElementById('mBest').textContent=pnl$(best.pnl||0);
      document.getElementById('mBestSub').textContent=(best.market||best.slug||'').slice(0,32);
      const wp=document.getElementById('mWorst');wp.textContent=pnl$(worst.pnl||0);
      wp.className='vl '+pc(worst.pnl||0);
      document.getElementById('mWorstSub').textContent=(worst.market||worst.slug||'').slice(0,32);
    }

    // Chart
    drawChart(d.pnlHistory||[]);
    document.getElementById('chartVal').textContent=pnl$(upnl);

    // Positions table
    document.getElementById('posCount').textContent=pos.length;
    const pb=document.getElementById('posBody');pb.innerHTML='';
    const sorted=[...pos].sort((a,b)=>(b.pnl||0)-(a.pnl||0));
    for(const p of sorted){
      const pv=p.pnl||0,pct=p.pnlPct?'('+Math.round(p.pnlPct)+'%)':'';
      pb.innerHTML+='<tr>'+
        '<td class="trunc" title="'+p.slug+'">'+(p.market||p.slug||'')+'</td>'+
        '<td style="font-weight:500">'+p.outcome+'</td>'+
        '<td class="mono">'+(p.entry||0).toFixed(2)+'</td>'+
        '<td class="mono '+(pv>=0?'g':'r')+'">'+(p.current||0).toFixed(2)+'</td>'+
        '<td class="mono c">$'+(p.value||0).toFixed(2)+'</td>'+
        '<td class="mono '+(pv>=0?'g':'r')+'" style="font-weight:600">'+pnl$(pv)+' <span class="d">'+pct+'</span></td>'+
        '</tr>';
    }

    // Bot stats
    const v2x=d.stats?.executed||0,v1x=v1.stats?.executed||0;
    document.getElementById('sV2').textContent=v2x;
    document.getElementById('sV1').textContent=v1x;
    document.getElementById('sSig').textContent=(d.stats?.total||0)+(v1.stats?.total||0);
    document.getElementById('botCount').textContent=(v2x+v1x)+' trades';

    // Trader performance
    const ts={...(d.traderStats||{})};
    for(const t of (v1.trades||[])){const n=t.trader||'?';if(!ts[n])ts[n]={trades:0,pnl:0};ts[n].trades++}
    const tg=document.getElementById('traderGrid');tg.innerHTML='';
    for(const [name,s] of Object.entries(ts).sort((a,b)=>(b[1].pnl||0)-(a[1].pnl||0))){
      tg.innerHTML+='<div class="tc"><div class="tn">'+name+'</div><div class="ts '+pc(s.pnl)+'">'+pnl$(s.pnl)+'</div><div class="ts">'+s.trades+' trades</div></div>';
    }

    // Trade log — V2 executed + V1 trades, sorted by time
    const v2trades=(d.trades||[]).filter(t=>t.status==='success'||t.status==='failed').map(t=>({...t,bot:'V2'}));
    const v1trades=(v1.trades||[]).map(t=>({...t,entry_price:t.entryPrice||t.entry_price,our_amount:parseFloat(t.ourAmount||t.our_amount||'5'),bot:'V1'}));
    const allTrades=[...v2trades,...v1trades].sort((a,b)=>new Date(b.timestamp||0).getTime()-new Date(a.timestamp||0).getTime()).slice(0,40);
    document.getElementById('logCount').textContent=allTrades.length;
    const tb=document.getElementById('tradeBody');tb.innerHTML='';
    for(const t of allTrades){
      const st=t.status==='success'?tag('success','OK'):tag('filtered',t.status?.toUpperCase());
      // Use market name from portfolio if available, otherwise clean up slug
      const mktName=t.market||(t.slug||'').split('-').slice(0,3).map(s=>s.charAt(0).toUpperCase()+s.slice(1)).join(' ');
      tb.innerHTML+='<tr>'+
        '<td class="mono d">'+timeStr(t.timestamp)+'</td>'+
        '<td class="mono" style="font-size:10px;color:var(--'+(t.bot==='V1'?'amber':'cyan')+')">'+t.bot+'</td>'+
        '<td class="mono" style="font-size:10px">'+t.trader+'</td>'+
        '<td>'+(t.action==='BUY'?tag('buy','BUY'):tag('sell','SELL'))+'</td>'+
        '<td class="trunc" title="'+(t.slug||'')+'">'+mktName+'</td>'+
        '<td>'+t.outcome+'</td>'+
        '<td class="mono">'+(t.entry_price?(t.entry_price).toFixed?t.entry_price.toFixed(2):t.entry_price:'—')+'</td>'+
        '<td class="mono c">'+(t.our_amount>0?'$'+(typeof t.our_amount==='number'?t.our_amount.toFixed(2):t.our_amount):'—')+'</td>'+
        '<td>'+st+'</td></tr>';
    }

    document.getElementById('lastUpdate').textContent='Updated '+new Date().toLocaleTimeString();
  }catch(e){console.error('Refresh error',e)}
}
refresh();setInterval(refresh,5000);
</script>
</body>
</html>`;
}

// ── Server ──────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html());
    return;
  }

  if (req.method === "GET" && req.url === "/api/data") {
    const data = apiData();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
    return;
  }

  if (req.method === "GET" && req.url === "/api/v1") {
    const data = v1Data();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
    return;
  }

  if (req.method === "POST" && req.url === "/api/start") {
    writeFileSync(join(DATA_DIR, "bot-status.json"), JSON.stringify({ running: true, paperMode: false }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ running: true }));
    return;
  }

  if (req.method === "POST" && req.url === "/api/stop") {
    writeFileSync(join(DATA_DIR, "bot-status.json"), JSON.stringify({ running: false, paperMode: false }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ running: false }));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});
