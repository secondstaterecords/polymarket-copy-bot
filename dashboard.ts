import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";

const DASHBOARD_PORT = parseInt(process.env.DASHBOARD_PORT || "3848");
const PROJECT_DIR = join(__dirname);
const TRADES_FILE = join(PROJECT_DIR, "trades.json");
const STATUS_FILE = join(PROJECT_DIR, "bot-status.json");

function loadTrades(): any[] {
  try {
    if (existsSync(TRADES_FILE)) {
      return JSON.parse(readFileSync(TRADES_FILE, "utf-8"));
    }
  } catch {}
  return [];
}

function getStatus(): { running: boolean } {
  try {
    if (existsSync(STATUS_FILE)) {
      return JSON.parse(readFileSync(STATUS_FILE, "utf-8"));
    }
  } catch {}
  return { running: true };
}

function setStatus(running: boolean): void {
  writeFileSync(STATUS_FILE, JSON.stringify({ running }));
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Polymarket Copy Bot</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  :root {
    --bg: #09090b; --card: #18181b; --border: #27272a;
    --text: #fafafa; --muted: #52525b; --dim: #a1a1aa;
    --green: #22c55e; --red: #ef4444; --blue: #3b82f6;
    --amber: #f59e0b; --purple: #a855f7;
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:var(--bg); color:var(--text); font-family:'Inter',-apple-system,sans-serif; -webkit-font-smoothing:antialiased; }
  .container { max-width:1280px; margin:0 auto; padding:32px 24px; }
  .header { display:flex; align-items:center; justify-content:space-between; margin-bottom:32px; }
  .header h1 { font-size:20px; font-weight:700; letter-spacing:-0.02em; }
  .header p { font-size:13px; color:var(--muted); margin-top:2px; }
  .header-right { display:flex; align-items:center; gap:12px; }
  .badge { display:inline-flex; align-items:center; gap:6px; padding:5px 12px; border-radius:9999px; font-size:12px; font-weight:600; }
  .badge-live { background:rgba(34,197,94,0.12); color:var(--green); }
  .badge-live::before { content:''; width:6px; height:6px; border-radius:50%; background:var(--green); animation:pulse 2s infinite; }
  .badge-stopped { background:rgba(239,68,68,0.12); color:var(--red); }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .btn { padding:7px 16px; border:1px solid var(--border); border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:inherit; background:var(--card); color:var(--text); transition:all 0.15s; }
  .btn:hover { background:#1f1f23; }
  .btn-go { background:var(--text); color:var(--bg); border-color:transparent; }
  .btn-go:hover { opacity:0.9; }
  .btn-stop { color:var(--red); }
  .btn-stop:hover { background:rgba(239,68,68,0.12); }
  .hero { background:var(--card); border:1px solid var(--border); border-radius:16px; padding:24px; margin-bottom:24px; display:grid; grid-template-columns:1fr 1fr 1fr; gap:24px; }
  .hero .label { font-size:12px; font-weight:500; color:var(--muted); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:4px; }
  .hero .big { font-size:36px; font-weight:800; letter-spacing:-0.03em; font-variant-numeric:tabular-nums; }
  .hero .sub { font-size:13px; color:var(--dim); margin-top:2px; }
  .stats { display:grid; grid-template-columns:repeat(6,1fr); gap:12px; margin-bottom:24px; }
  .stat { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:16px 18px; }
  .stat .sl { font-size:11px; font-weight:500; color:var(--muted); text-transform:uppercase; letter-spacing:0.06em; }
  .stat .sv { font-size:26px; font-weight:800; margin-top:6px; letter-spacing:-0.02em; font-variant-numeric:tabular-nums; }
  .section-title { font-size:14px; font-weight:600; color:var(--dim); margin-bottom:12px; }
  .table-wrap { background:var(--card); border:1px solid var(--border); border-radius:12px; overflow:hidden; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  thead th { text-align:left; padding:10px 16px; font-size:11px; font-weight:500; color:var(--muted); text-transform:uppercase; letter-spacing:0.06em; border-bottom:1px solid var(--border); background:var(--bg); }
  tbody td { padding:10px 16px; border-bottom:1px solid #1a1a1e; }
  tbody tr:last-child td { border-bottom:none; }
  tbody tr:hover { background:rgba(255,255,255,0.02); }
  .tag { display:inline-flex; padding:2px 8px; border-radius:6px; font-size:11px; font-weight:600; }
  .tag-buy { background:rgba(34,197,94,0.12); color:var(--green); }
  .tag-sell { background:rgba(245,158,11,0.12); color:var(--amber); }
  .tag-success { background:rgba(34,197,94,0.12); color:var(--green); }
  .tag-failed { background:rgba(168,85,247,0.12); color:var(--purple); }
  .tag-skipped { background:rgba(245,158,11,0.12); color:var(--amber); }
  .empty { text-align:center; padding:48px; color:var(--muted); font-size:14px; }
  .note { font-size:11px; color:var(--muted); margin-top:8px; }
  @media(max-width:900px) { .stats{grid-template-columns:repeat(3,1fr)} .hero{grid-template-columns:1fr} }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div><h1>Copy Bot</h1><p>Tracking 10 traders &middot; $5/trade &middot; 30s polling</p></div>
    <div class="header-right">
      <span class="note">Updates every 5s</span>
      <span class="badge badge-stopped" id="badge">STOPPED</span>
      <button class="btn btn-go" id="startBtn" onclick="ctrl('start')">Start</button>
      <button class="btn btn-stop" id="stopBtn" onclick="ctrl('stop')">Stop</button>
    </div>
  </div>
  <div class="hero">
    <div><div class="label">Paper P&L</div><div class="big" id="pnl" style="color:var(--muted)">$0.00</div><div class="sub" id="ret">Tracking hypothetical returns</div></div>
    <div><div class="label">Paper Invested</div><div class="big" id="inv" style="color:var(--dim)">$0</div><div class="sub">Total signal value</div></div>
    <div><div class="label">Signals Detected</div><div class="big" id="sig" style="color:var(--blue)">0</div><div class="sub">From top 10 traders</div></div>
  </div>
  <div class="stats">
    <div class="stat"><div class="sl">Executed</div><div class="sv" style="color:var(--green)" id="s_ex">0</div></div>
    <div class="stat"><div class="sl">Buys</div><div class="sv" id="s_buy">0</div></div>
    <div class="stat"><div class="sl">Sells</div><div class="sv" id="s_sell">0</div></div>
    <div class="stat"><div class="sl">Paper Only</div><div class="sv" style="color:var(--purple)" id="s_paper">0</div></div>
    <div class="stat"><div class="sl">Skipped</div><div class="sv" style="color:var(--muted)" id="s_skip">0</div></div>
    <div class="stat"><div class="sl">Total</div><div class="sv" id="s_total">0</div></div>
  </div>
  <div><div class="section-title">Trade Log</div>
    <div class="table-wrap">
      <table><thead><tr><th>Time</th><th>Trader</th><th>Action</th><th>Market</th><th>Outcome</th><th>Entry</th><th>$</th><th>Status</th></tr></thead>
      <tbody id="tb"><tr><td colspan="8" class="empty">Waiting for trade signals...</td></tr></tbody></table>
    </div>
  </div>
</div>
<script>
async function refresh() {
  try {
    const res = await fetch("/api/data");
    const d = await res.json();
    const s = d.stats;
    // Badge
    var b = document.getElementById("badge");
    if (d.running) { b.textContent="LIVE"; b.className="badge badge-live"; }
    else { b.textContent="STOPPED"; b.className="badge badge-stopped"; }
    // Hero
    var p = s.paperPnl||0;
    var pe = document.getElementById("pnl");
    pe.textContent = (p>=0?"+$":"-$")+Math.abs(p).toFixed(2);
    pe.style.color = p>=0?"var(--green)":"var(--red)";
    document.getElementById("ret").textContent = s.paperReturn?(s.paperReturn>=0?"+":"")+s.paperReturn+"% return (paper)":"Tracking hypothetical returns";
    document.getElementById("inv").textContent = "$"+s.paperInvested;
    document.getElementById("sig").textContent = s.totalTrades;
    // Stats
    document.getElementById("s_ex").textContent = s.executed;
    document.getElementById("s_buy").textContent = s.buys;
    document.getElementById("s_sell").textContent = s.sells;
    document.getElementById("s_paper").textContent = s.failed;
    document.getElementById("s_skip").textContent = s.skipped;
    document.getElementById("s_total").textContent = s.totalTrades;
    // Table
    var trades = (d.trades||[]).slice().reverse();
    var tb = document.getElementById("tb");
    if (!trades.length) { tb.innerHTML='<tr><td colspan="8" class="empty">Waiting for trade signals...</td></tr>'; return; }
    tb.innerHTML = trades.slice(0,100).map(function(t){
      var time = new Date(t.timestamp).toLocaleTimeString();
      var ac = t.action==="BUY"?"tag-buy":"tag-sell";
      var sc = "tag-"+t.status;
      var sl = t.status==="failed"?"paper":t.status;
      var slug = (t.slug||"").substring(0,30);
      var ep = t.entryPrice?t.entryPrice.toFixed(2)+"c":"-";
      return "<tr><td>"+time+"</td><td>"+(t.trader||"")+"</td><td><span class='tag "+ac+"'>"+t.action+"</span></td><td>"+slug+"</td><td>"+(t.outcome||"")+"</td><td>"+ep+"</td><td>$"+(t.ourAmount||"0")+"</td><td><span class='tag "+sc+"'>"+sl+"</span></td></tr>";
    }).join("");
  } catch(e) {}
}
async function ctrl(action) {
  await fetch("/api/"+action, {method:"POST"});
  setTimeout(refresh, 300);
}
refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>`;

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  // Dashboard HTML
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(HTML);
    return;
  }

  // API endpoints — read files directly, no dependency on bot HTTP server
  res.setHeader("Content-Type", "application/json");

  if (req.url === "/api/data") {
    const trades = loadTrades();
    const status = getStatus();
    const executed = trades.filter((t: any) => t.status === "success");
    const failed = trades.filter((t: any) => t.status === "failed");
    const skipped = trades.filter((t: any) => t.status === "skipped");
    const buys = executed.filter((t: any) => t.action === "BUY");
    const sells = executed.filter((t: any) => t.action === "SELL");
    const paperBuys = trades.filter((t: any) => t.action === "BUY" && t.entryPrice > 0);

    // Simple paper P&L from entry prices (no live price lookups - those happen in bot)
    let paperInvested = 0;
    for (const t of paperBuys) {
      paperInvested += parseFloat(t.ourAmount || "5");
    }

    // Read cached paper P&L from bot's output if available
    let paperPnl = 0;
    let paperReturn = 0;
    try {
      const pnlFile = join(PROJECT_DIR, "paper-pnl.json");
      if (existsSync(pnlFile)) {
        const pnlData = JSON.parse(readFileSync(pnlFile, "utf-8"));
        paperPnl = pnlData.pnl || 0;
        paperReturn = pnlData.returnPct || 0;
      }
    } catch {}

    res.writeHead(200);
    res.end(JSON.stringify({
      running: status.running,
      trades,
      stats: {
        totalTrades: trades.length,
        executed: executed.length,
        failed: failed.length,
        skipped: skipped.length,
        buys: buys.length,
        sells: sells.length,
        paperPnl,
        paperInvested,
        paperReturn,
      },
    }));
  } else if (req.url === "/api/start" && req.method === "POST") {
    setStatus(true);
    res.writeHead(200);
    res.end(JSON.stringify({ running: true }));
  } else if (req.url === "/api/stop" && req.method === "POST") {
    setStatus(false);
    res.writeHead(200);
    res.end(JSON.stringify({ running: false }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "not found" }));
  }
});

server.listen(DASHBOARD_PORT, () => {
  console.log("Dashboard running at http://localhost:" + DASHBOARD_PORT);
});
