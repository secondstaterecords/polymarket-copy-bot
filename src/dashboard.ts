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

function getDb(): Database.Database | null {
  if (!existsSync(DB_PATH)) return null;
  try { return new Database(DB_PATH, { readonly: true }); } catch { return null; }
}

function apiData(): any {
  const db = getDb();
  let trades: any[] = [];
  let stats = { executed: 0, paper: 0, filtered: 0, failed: 0, sells: 0, total: 0 };

  if (db) {
    try {
      trades = db.prepare("SELECT * FROM trades ORDER BY id DESC LIMIT 200").all();
      const countRow = (status: string, extra = "") =>
        (db.prepare(`SELECT COUNT(*) as c FROM trades WHERE status = ? ${extra}`).get(status) as any)?.c || 0;
      stats.executed = countRow("success", "AND is_real = 1");
      stats.paper = countRow("paper");
      stats.filtered = countRow("filtered");
      stats.failed = countRow("failed");
      stats.sells = (db.prepare("SELECT COUNT(*) as c FROM trades WHERE action = 'SELL'").get() as any)?.c || 0;
      stats.total = (db.prepare("SELECT COUNT(*) as c FROM trades").get() as any)?.c || 0;
    } finally {
      db.close();
    }
  }

  const pnl = readJson("paper-pnl.json") || { pnl: 0, invested: 0, returnPct: 0, positions: [] };
  const status = readJson("bot-status.json") || { running: false };

  return { running: status.running, trades, pnl, stats };
}

// ── HTML ────────────────────────────────────────────────────────────
function html(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Polymarket Copy Bot V2</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#09090b;--card:#18181b;--border:#27272a;--text:#fafafa;--dim:#a1a1aa;
--green:#22c55e;--red:#ef4444;--purple:#a855f7;--amber:#f59e0b;--blue:#3b82f6}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
background:var(--bg);color:var(--text);padding:20px;max-width:1400px;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}
.header h1{font-size:20px;font-weight:600;letter-spacing:-0.02em}
.badges{display:flex;gap:8px;align-items:center}
.badge{padding:4px 12px;border-radius:9999px;font-size:12px;font-weight:600;text-transform:uppercase}
.badge-live{background:rgba(34,197,94,.15);color:var(--green);animation:pulse 2s infinite}
.badge-stopped{background:rgba(239,68,68,.15);color:var(--red)}
.badge-paper{background:rgba(168,85,247,.15);color:var(--purple)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}
.controls{display:flex;gap:8px}
.controls button{padding:6px 16px;border:1px solid var(--border);border-radius:8px;
background:var(--card);color:var(--text);cursor:pointer;font-size:13px;font-weight:500}
.controls button:hover{border-color:var(--dim)}
.hero{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
.hero .card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px}
.hero .card .label{font-size:12px;color:var(--dim);margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em}
.hero .card .value{font-size:28px;font-weight:700;letter-spacing:-0.03em}
.hero .card .sub{font-size:13px;color:var(--dim);margin-top:2px}
.value-green{color:var(--green)}.value-red{color:var(--red)}.value-blue{color:var(--blue)}.value-dim{color:var(--dim)}
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px}
.stats .card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center}
.stats .card .label{font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.05em}
.stats .card .value{font-size:22px;font-weight:700;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:13px}
thead th{text-align:left;padding:10px 8px;color:var(--dim);font-size:11px;
text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--border)}
tbody td{padding:8px;border-bottom:1px solid var(--border);vertical-align:middle}
tbody tr:hover{background:rgba(255,255,255,.02)}
.tag{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600}
.tag-buy{background:rgba(34,197,94,.15);color:var(--green)}
.tag-sell{background:rgba(239,68,68,.15);color:var(--red)}
.tag-success{background:rgba(34,197,94,.15);color:var(--green)}
.tag-paper{background:rgba(168,85,247,.15);color:var(--purple)}
.tag-filtered{background:rgba(245,158,11,.15);color:var(--amber)}
.tag-failed{background:rgba(239,68,68,.15);color:var(--red)}
.note{color:var(--dim);font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.table-wrap{background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.table-header{padding:16px;border-bottom:1px solid var(--border);font-weight:600;font-size:14px}
.table-scroll{max-height:500px;overflow-y:auto}
@media(max-width:768px){
.hero,.stats{grid-template-columns:repeat(2,1fr)}
.table-scroll{overflow-x:auto}
}
</style>
</head>
<body>
<div class="header">
  <h1>Polymarket Copy Bot <span style="color:var(--dim);font-weight:400">V2</span></h1>
  <div style="display:flex;gap:16px;align-items:center">
    <div class="badges">
      <span id="statusBadge" class="badge badge-stopped">STOPPED</span>
      <span id="paperBadge" class="badge badge-paper" style="display:none">PAPER</span>
    </div>
    <div class="controls">
      <button onclick="ctrl('start')">Start</button>
      <button onclick="ctrl('stop')">Stop</button>
    </div>
  </div>
</div>

<div class="hero">
  <div class="card"><div class="label">Real P&L</div><div class="value" id="realPnl">$0.00</div><div class="sub" id="realReturn">0.00%</div></div>
  <div class="card"><div class="label">Paper P&L</div><div class="value" id="paperPnl">$0.00</div><div class="sub" id="paperReturn">0.00%</div></div>
  <div class="card"><div class="label">Signals Detected</div><div class="value value-blue" id="signals">0</div><div class="sub">total</div></div>
  <div class="card"><div class="label">Filter Pass Rate</div><div class="value value-dim" id="passRate">—</div><div class="sub">of signals</div></div>
</div>

<div class="stats">
  <div class="card"><div class="label">Executed (Real)</div><div class="value value-green" id="sExecuted">0</div></div>
  <div class="card"><div class="label">Paper Trades</div><div class="value" style="color:var(--purple)" id="sPaper">0</div></div>
  <div class="card"><div class="label">Filtered Out</div><div class="value" style="color:var(--amber)" id="sFiltered">0</div></div>
  <div class="card"><div class="label">Failed</div><div class="value value-red" id="sFailed">0</div></div>
  <div class="card"><div class="label">Sells</div><div class="value" id="sSells">0</div></div>
</div>

<div class="table-wrap">
  <div class="table-header">Trade Log</div>
  <div class="table-scroll">
    <table>
      <thead><tr>
        <th>Time</th><th>Trader</th><th>Action</th><th>Market</th><th>Outcome</th>
        <th>Price</th><th>Amount</th><th>Status</th><th>Note</th>
      </tr></thead>
      <tbody id="tradeBody"></tbody>
    </table>
  </div>
</div>

<script>
function pnlStr(v){const s=v>=0?'+':'';return s+'$'+Math.abs(v).toFixed(2)}
function pnlClass(v){return v>=0?'value-green':'value-red'}
function tagHtml(cls,text){return '<span class="tag tag-'+cls+'">'+text+'</span>'}
function timeStr(ts){try{const d=new Date(ts);return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}catch{return ts}}

async function ctrl(action){
  await fetch('/api/'+action,{method:'POST'});
  refresh();
}

async function refresh(){
  try{
    const res=await fetch('/api/data');
    const d=await res.json();

    // Status badges
    const sb=document.getElementById('statusBadge');
    sb.className='badge '+(d.running?'badge-live':'badge-stopped');
    sb.textContent=d.running?'LIVE':'STOPPED';
    document.getElementById('paperBadge').style.display='inline-block';

    // P&L
    const pp=d.pnl||{pnl:0,returnPct:0};
    const pe=document.getElementById('paperPnl');
    pe.textContent=pnlStr(pp.pnl);pe.className='value '+pnlClass(pp.pnl);
    document.getElementById('paperReturn').textContent=pp.returnPct.toFixed(2)+'% return';

    // Real P&L — compute from trades
    let realPnlVal=0,realReturn=0;
    const realTrades=(d.trades||[]).filter(t=>t.is_real===1&&t.status==='success'&&t.action==='BUY');
    // Use paper P&L positions to approximate
    document.getElementById('realPnl').textContent=pnlStr(realPnlVal);
    document.getElementById('realPnl').className='value '+pnlClass(realPnlVal);
    document.getElementById('realReturn').textContent=realReturn.toFixed(2)+'% return';

    // Signals & pass rate
    const total=d.stats?.total||(d.trades||[]).length;
    const filtered=d.stats?.filtered||0;
    const passed=total-filtered;
    document.getElementById('signals').textContent=total;
    document.getElementById('passRate').textContent=total>0?Math.round((passed/total)*100)+'%':'—';

    // Stats
    document.getElementById('sExecuted').textContent=d.stats?.executed||0;
    document.getElementById('sPaper').textContent=d.stats?.paper||0;
    document.getElementById('sFiltered').textContent=d.stats?.filtered||0;
    document.getElementById('sFailed').textContent=d.stats?.failed||0;
    document.getElementById('sSells').textContent=d.stats?.sells||0;

    // Trade log
    const tbody=document.getElementById('tradeBody');
    tbody.innerHTML='';
    for(const t of (d.trades||[])){
      const actionTag=t.action==='BUY'?tagHtml('buy','BUY'):tagHtml('sell','SELL');
      const statusTag=tagHtml(t.status,t.status.toUpperCase());
      const note=t.error||'';
      tbody.innerHTML+='<tr>'+
        '<td>'+timeStr(t.timestamp)+'</td>'+
        '<td>'+t.trader+'</td>'+
        '<td>'+actionTag+'</td>'+
        '<td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+t.slug+'</td>'+
        '<td>'+t.outcome+'</td>'+
        '<td>'+(t.entry_price?t.entry_price.toFixed(2):'—')+'</td>'+
        '<td>'+(t.our_amount?'$'+t.our_amount.toFixed(2):'—')+'</td>'+
        '<td>'+statusTag+'</td>'+
        '<td class="note" title="'+note.replace(/"/g,'&quot;')+'">'+note+'</td>'+
        '</tr>';
    }
  }catch(e){console.error('Refresh error',e)}
}

refresh();
setInterval(refresh,5000);
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

  if (req.method === "POST" && req.url === "/api/start") {
    writeFileSync(join(DATA_DIR, "bot-status.json"), JSON.stringify({ running: true }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ running: true }));
    return;
  }

  if (req.method === "POST" && req.url === "/api/stop") {
    writeFileSync(join(DATA_DIR, "bot-status.json"), JSON.stringify({ running: false }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ running: false }));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Dashboard V2 running at http://localhost:${PORT}`);
});
