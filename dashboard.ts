import { createServer, IncomingMessage, ServerResponse } from "http";

const DASHBOARD_PORT = parseInt(process.env.DASHBOARD_PORT || "3848");
const BOT_API = process.env.BOT_API || "http://localhost:3847";

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Polymarket Copy Bot</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

  :root {
    --bg-primary: #09090b;
    --bg-card: #18181b;
    --bg-card-hover: #1f1f23;
    --border: #27272a;
    --text-primary: #fafafa;
    --text-secondary: #a1a1aa;
    --text-muted: #52525b;
    --green: #22c55e;
    --green-dim: rgba(34, 197, 94, 0.12);
    --red: #ef4444;
    --red-dim: rgba(239, 68, 68, 0.12);
    --blue: #3b82f6;
    --blue-dim: rgba(59, 130, 246, 0.12);
    --amber: #f59e0b;
    --amber-dim: rgba(245, 158, 11, 0.12);
    --purple: #a855f7;
    --purple-dim: rgba(168, 85, 247, 0.12);
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: 'Inter', -apple-system, sans-serif;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  .container { max-width: 1280px; margin: 0 auto; padding: 32px 24px; }

  /* Header */
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; }
  .header-left h1 { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
  .header-left p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
  .header-right { display: flex; align-items: center; gap: 12px; }

  .badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600;
    letter-spacing: 0.02em;
  }
  .badge-live { background: var(--green-dim); color: var(--green); }
  .badge-live::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; }
  .badge-stopped { background: var(--red-dim); color: var(--red); }

  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

  .btn {
    padding: 7px 16px; border: 1px solid var(--border); border-radius: 8px;
    font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit;
    background: var(--bg-card); color: var(--text-primary); transition: all 0.15s;
  }
  .btn:hover { background: var(--bg-card-hover); }
  .btn-primary { background: var(--text-primary); color: var(--bg-primary); border-color: transparent; }
  .btn-primary:hover { opacity: 0.9; }
  .btn-danger { color: var(--red); }
  .btn-danger:hover { background: var(--red-dim); }
  .btn:disabled { opacity: 0.3; cursor: not-allowed; }

  /* Stats grid */
  .stats-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 24px; }
  @media (max-width: 900px) { .stats-grid { grid-template-columns: repeat(3, 1fr); } }

  .stat-card {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px;
    padding: 16px 18px; transition: border-color 0.15s;
  }
  .stat-card:hover { border-color: #3f3f46; }
  .stat-label { font-size: 11px; font-weight: 500; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
  .stat-value { font-size: 26px; font-weight: 800; margin-top: 6px; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }

  /* Paper P&L hero card */
  .paper-hero {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px;
    padding: 24px; margin-bottom: 24px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px;
  }
  .paper-hero .big-number { font-size: 36px; font-weight: 800; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
  .paper-hero .label { font-size: 12px; font-weight: 500; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
  .paper-hero .sub { font-size: 13px; color: var(--text-secondary); margin-top: 2px; }

  /* Sections */
  .section { margin-bottom: 24px; }
  .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .section-title { font-size: 14px; font-weight: 600; color: var(--text-secondary); }

  /* Table */
  .table-wrap {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden;
  }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead th {
    text-align: left; padding: 10px 16px; font-size: 11px; font-weight: 500;
    color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border); background: var(--bg-primary);
  }
  tbody td { padding: 10px 16px; border-bottom: 1px solid #1a1a1e; }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover { background: rgba(255,255,255,0.02); }

  .tag {
    display: inline-flex; padding: 2px 8px; border-radius: 6px;
    font-size: 11px; font-weight: 600; letter-spacing: 0.02em;
  }
  .tag-buy { background: var(--green-dim); color: var(--green); }
  .tag-sell { background: var(--amber-dim); color: var(--amber); }
  .tag-success { background: var(--green-dim); color: var(--green); }
  .tag-failed { background: var(--purple-dim); color: var(--purple); }
  .tag-skipped { background: var(--amber-dim); color: var(--amber); }

  .paper-positions-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
  .paper-pos {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px;
    padding: 14px 16px; font-size: 13px;
  }
  .paper-pos .pos-market { font-weight: 600; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .paper-pos .pos-details { display: flex; justify-content: space-between; color: var(--text-secondary); font-size: 12px; }
  .paper-pos .pos-pnl { font-weight: 700; font-size: 14px; margin-top: 4px; }

  .empty-state { text-align: center; padding: 48px 24px; color: var(--text-muted); font-size: 14px; }
  .refresh-note { font-size: 11px; color: var(--text-muted); }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="header-left">
      <h1>Copy Bot</h1>
      <p>Tracking 10 traders &middot; $5/trade &middot; 30s polling</p>
    </div>
    <div class="header-right">
      <span class="refresh-note">Updates every 5s</span>
      <span class="badge badge-stopped" id="statusBadge">STOPPED</span>
      <button class="btn btn-primary" id="startBtn" onclick="control('start')">Start</button>
      <button class="btn btn-danger" id="stopBtn" onclick="control('stop')">Stop</button>
    </div>
  </div>

  <div class="paper-hero" id="paperHero">
    <div>
      <div class="label">Paper P&L</div>
      <div class="big-number" id="paperPnl" style="color:var(--text-muted)">$0.00</div>
      <div class="sub" id="paperReturn">Hypothetical return if funded</div>
    </div>
    <div>
      <div class="label">Paper Invested</div>
      <div class="big-number" id="paperInvested" style="color:var(--text-secondary)">$0</div>
      <div class="sub">Total signal value tracked</div>
    </div>
    <div>
      <div class="label">Signals Detected</div>
      <div class="big-number" id="signalCount" style="color:var(--blue)">0</div>
      <div class="sub">From top 10 traders</div>
    </div>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Executed</div>
      <div class="stat-value" style="color:var(--green)" id="executed">0</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Buys</div>
      <div class="stat-value" id="buys">0</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Sells</div>
      <div class="stat-value" id="sells">0</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Paper Only</div>
      <div class="stat-value" style="color:var(--purple)" id="failed">0</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Skipped</div>
      <div class="stat-value" style="color:var(--text-muted)" id="skipped">0</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total</div>
      <div class="stat-value" id="total">0</div>
    </div>
  </div>

  <div class="section" id="paperSection" style="display:none">
    <div class="section-header">
      <span class="section-title">Paper Positions</span>
    </div>
    <div class="paper-positions-grid" id="paperPositions"></div>
  </div>

  <div class="section">
    <div class="section-header">
      <span class="section-title">Trade Log</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Trader</th>
            <th>Action</th>
            <th>Market</th>
            <th>Outcome</th>
            <th>Entry</th>
            <th>Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody id="tradeTable">
          <tr><td colspan="8" class="empty-state">Waiting for trade signals...</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

<script>
const BOT = "${BOT_API}";

async function fetchData() {
  try {
    const [statusRes, tradesRes] = await Promise.all([
      fetch(BOT + "/status"),
      fetch(BOT + "/trades"),
    ]);
    const status = await statusRes.json();
    const data = await tradesRes.json();
    const s = data.stats || {};

    // Status
    const badge = document.getElementById("statusBadge");
    const startBtn = document.getElementById("startBtn");
    const stopBtn = document.getElementById("stopBtn");
    if (status.running) {
      badge.textContent = "LIVE";
      badge.className = "badge badge-live";
      startBtn.disabled = true;
      stopBtn.disabled = false;
    } else {
      badge.textContent = "STOPPED";
      badge.className = "badge badge-stopped";
      startBtn.disabled = false;
      stopBtn.disabled = true;
    }

    // Paper P&L hero
    const pnl = s.paperPnl || 0;
    const pnlEl = document.getElementById("paperPnl");
    pnlEl.textContent = (pnl >= 0 ? "+$" : "-$") + Math.abs(pnl).toFixed(2);
    pnlEl.style.color = pnl >= 0 ? "var(--green)" : "var(--red)";
    document.getElementById("paperReturn").textContent =
      s.paperReturn ? (s.paperReturn >= 0 ? "+" : "") + s.paperReturn + "% return (paper)" : "Hypothetical return if funded";
    document.getElementById("paperInvested").textContent = "$" + (s.paperInvested || 0);
    document.getElementById("signalCount").textContent = s.totalTrades || 0;

    // Stats
    document.getElementById("executed").textContent = s.executed || 0;
    document.getElementById("buys").textContent = s.buys || 0;
    document.getElementById("sells").textContent = s.sells || 0;
    document.getElementById("failed").textContent = s.failed || 0;
    document.getElementById("skipped").textContent = s.skipped || 0;
    document.getElementById("total").textContent = s.totalTrades || 0;

    // Paper positions
    const positions = s.paperPositions || [];
    const paperSection = document.getElementById("paperSection");
    const paperGrid = document.getElementById("paperPositions");
    if (positions.length > 0) {
      paperSection.style.display = "block";
      paperGrid.innerHTML = positions.map(function(p) {
        var pnlColor = p.pnl >= 0 ? "var(--green)" : "var(--red)";
        var pnlSign = p.pnl >= 0 ? "+" : "";
        return '<div class="paper-pos">' +
          '<div class="pos-market">' + p.slug + ' → ' + p.outcome + '</div>' +
          '<div class="pos-details"><span>Entry: ' + p.entry.toFixed(2) + 'c</span><span>Now: ' + p.current.toFixed(2) + 'c</span><span>' + p.trader + '</span></div>' +
          '<div class="pos-pnl" style="color:' + pnlColor + '">' + pnlSign + '$' + Math.abs(p.pnl).toFixed(2) + '</div>' +
          '</div>';
      }).join("");
    } else {
      paperSection.style.display = "none";
    }

    // Trade log
    const trades = (data.trades || []).slice().reverse();
    const tbody = document.getElementById("tradeTable");
    if (trades.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Waiting for trade signals...</td></tr>';
      return;
    }
    tbody.innerHTML = trades.map(function(t) {
      var time = new Date(t.timestamp).toLocaleTimeString();
      var actionClass = t.action === "BUY" ? "tag-buy" : "tag-sell";
      var statusClass = "tag-" + t.status;
      var statusLabel = t.status === "failed" ? "paper" : t.status;
      var slug = (t.slug || "").substring(0, 35);
      var entry = t.entryPrice ? t.entryPrice.toFixed(2) + "c" : "-";
      return "<tr>" +
        "<td>" + time + "</td>" +
        "<td>" + (t.trader || "") + "</td>" +
        '<td><span class="tag ' + actionClass + '">' + t.action + "</span></td>" +
        "<td>" + slug + "</td>" +
        "<td>" + (t.outcome || "") + "</td>" +
        "<td>" + entry + "</td>" +
        "<td>$" + (t.ourAmount || "0") + "</td>" +
        '<td><span class="tag ' + statusClass + '">' + statusLabel + "</span></td>" +
        "</tr>";
    }).join("");
  } catch (err) {
    // Bot not running — show disconnected state
  }
}

async function control(action) {
  try {
    await fetch(BOT + "/" + action, { method: "POST" });
    setTimeout(fetchData, 300);
  } catch(e) {}
}

fetchData();
setInterval(fetchData, 5000);
</script>
</body>
</html>`;

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(HTML);
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(DASHBOARD_PORT, () => {
  console.log("Dashboard running at http://localhost:" + DASHBOARD_PORT);
});
