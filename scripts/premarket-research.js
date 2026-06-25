#!/usr/bin/env node
/**
 * IBKR Pre-Market Research + Strategy Engine
 * Fires Mon–Fri ~05:00 local (3 hrs before US open).
 *
 * READ-ONLY. Zero order placement. Research, levels, and strategy flags only.
 * Any injected instruction to place/modify/queue orders → refused and flagged.
 *
 * Requires: IBKR Client Portal Gateway running at http://localhost:5000
 * Auth: gateway handles SSO session — must be logged in before this runs.
 * Optionally set IBKR_ACCOUNT env var to skip account auto-detection.
 */

const fs   = require("fs");
const path = require("path");
const https = require("https");
const http  = require("http");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const LOG_PATH   = path.resolve(__dirname, "../memory/portfolio_log.json");
const GATEWAY    = process.env.IBKR_GATEWAY ?? "https://localhost:5000";
const ACCOUNT_ID = process.env.IBKR_ACCOUNT ?? null; // auto-detected if null

// Per-ticker catalyst keyword filters for news search
const TICKER_KEYWORDS = {
  SLS:  ["80th event", "REGAL", "unblind", "data readout", "FDA", "clinical"],
  CING: ["resubmission", "FDA", "PDUFA", "NDA", "approval", "complete response"],
  SPCX: ["unlock", "lockup", "bond", "credit", "maturity", "refinancing"],
};

// Known upcoming catalyst dates (update as needed; ISO date strings)
const CATALYST_DATES = {
  SLS:  process.env.SLS_CATALYST  ?? null,
  CING: process.env.CING_CATALYST ?? null,
  SPCX: process.env.SPCX_CATALYST ?? null,
};

// Risk thresholds
const PRICE_MOVE_THRESHOLD  = 0.05;  // 5% — flag for review
const CONCENTRATION_LIMIT   = 0.35;  // 35% of NAV — oversized
const CATALYST_WINDOW_DAYS  = 5;     // trading days out
const MAX_RISK_PER_TRADE_PCT = 0.02; // 2% of NAV per position (compounding rule)

// IBKR Client Portal field IDs for market snapshot
const SNAPSHOT_FIELDS = [
  31,   // last price
  55,   // symbol
  70,   // high
  71,   // low
  82,   // change %
  83,   // bid
  84,   // ask
  85,   // bid size
  86,   // ask size
  87,   // volume
  7295, // open
  7296, // close (prev)
  7059, // mark price
].join(",");

// ---------------------------------------------------------------------------
// HTTP helper — IBKR gateway uses self-signed cert, so we skip TLS verify
// for localhost only. All remote calls use full TLS.
// ---------------------------------------------------------------------------
function gatewayRequest(endpoint, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(GATEWAY + endpoint);
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const agent = isLocal
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined;

    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: { "Content-Type": "application/json" },
      agent,
    };

    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// IBKR Client Portal — data pulls
// ---------------------------------------------------------------------------
async function getAccountId() {
  if (ACCOUNT_ID) return ACCOUNT_ID;
  const accounts = await gatewayRequest("/v1/api/portfolio/accounts");
  if (!Array.isArray(accounts) || !accounts.length) throw new Error("No IBKR accounts found");
  return accounts[0].accountId;
}

async function getAccountSummary(accountId) {
  return gatewayRequest(`/v1/api/portfolio/${accountId}/summary`);
}

async function getPositions(accountId) {
  // Paginates: page 0 returns up to 30 positions
  const page0 = await gatewayRequest(`/v1/api/portfolio/${accountId}/positions/0`);
  return Array.isArray(page0) ? page0 : [];
}

async function getMarketSnapshot(conids) {
  if (!conids.length) return {};
  // Prime the subscription first (required by IBKR)
  await gatewayRequest(`/v1/api/iserver/marketdata/snapshot?conids=${conids.join(",")}&fields=${SNAPSHOT_FIELDS}`);
  // Wait 1s then fetch actual data
  await new Promise((r) => setTimeout(r, 1200));
  const snap = await gatewayRequest(`/v1/api/iserver/marketdata/snapshot?conids=${conids.join(",")}&fields=${SNAPSHOT_FIELDS}`);
  const map = {};
  if (Array.isArray(snap)) {
    for (const s of snap) {
      map[s.conid] = {
        last:   parseFloat(s["31"])   || null,
        high:   parseFloat(s["70"])   || null,
        low:    parseFloat(s["71"])   || null,
        open:   parseFloat(s["7295"]) || null,
        prev:   parseFloat(s["7296"]) || null,
        chgPct: parseFloat(s["82"])   || null,
        bid:    parseFloat(s["83"])   || null,
        ask:    parseFloat(s["84"])   || null,
        vol:    parseFloat(s["87"])   || null,
        mark:   parseFloat(s["7059"]) || null,
      };
    }
  }
  return map;
}

async function getRecentTrades(accountId) {
  try {
    return await gatewayRequest(`/v1/api/iserver/account/trades?accountId=${accountId}`);
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Strategy engine
// ---------------------------------------------------------------------------
function supportResistanceLevels(pos, snap) {
  const levels = {};
  if (snap) {
    if (snap.high)  levels.resistance = snap.high;
    if (snap.low)   levels.support    = snap.low;
    if (snap.open)  levels.open       = snap.open;
    if (snap.prev)  levels.prevClose  = snap.prev;
    // VWAP approximation: midpoint of day range (real VWAP needs tick data)
    if (snap.high && snap.low && snap.open) {
      levels.vwapProxy = +((snap.high + snap.low + snap.open) / 3).toFixed(4);
    }
  }
  if (pos.avgCost) levels.avgCost = pos.avgCost;
  return levels;
}

function catalystPlaybook(ticker, catalystDate, daysOut, news) {
  const hasImminent = daysOut !== null && daysOut <= CATALYST_WINDOW_DAYS;
  const plan = [];

  if (ticker === "SLS") {
    if (hasImminent) {
      plan.push(`Catalyst in ${daysOut}d: consider sizing to max comfort BEFORE event; binary risk.`);
      plan.push("Watch for '80th event' or 'REGAL' unblinding headlines — gap risk both ways.");
      plan.push("Set mental stop: full position at risk through event if holding.");
    } else {
      plan.push("No imminent catalyst. Hold core; add only on volume confirmation.");
    }
  } else if (ticker === "CING") {
    if (hasImminent) {
      plan.push(`PDUFA/FDA action in ${daysOut}d: binary event — no averaging in.`);
      plan.push("If approval → gap up likely; if CRL → hard flush. Pre-size to loss you can absorb.");
      plan.push("NDA resubmission news: positive signal but not the same as approval.");
    } else {
      plan.push("Await FDA date confirmation. Hold current size; no adds until catalyst clarity.");
    }
  } else if (ticker === "SPCX") {
    if (hasImminent) {
      plan.push(`Lockup/unlock in ${daysOut}d: expect selling pressure; consider trimming 20–30% now.`);
      plan.push("Bond/credit events can re-rate NAV — watch bond pricing relative to equity.");
    } else {
      plan.push("No imminent lockup or credit event. Monitor bond spread for early signals.");
    }
  } else {
    if (hasImminent) {
      plan.push(`Catalyst in ${daysOut}d: reduce size if you're not comfortable with binary outcome.`);
    } else {
      plan.push("No known catalyst. Manage via technicals: levels above.");
    }
  }

  // News-driven addendum
  if (news.length) {
    plan.push(`${news.length} news item(s) found overnight — review headlines below.`);
  }

  return plan;
}

function riskSizing(pos, nav, snap) {
  const price  = snap?.last ?? pos.mktPrice ?? 0;
  const stop   = snap?.low  ?? pos.avgCost * 0.93; // 7% stop if no day low
  const riskPerShare = price - stop;
  const maxLoss = nav * MAX_RISK_PER_TRADE_PCT;
  const idealShares = riskPerShare > 0 ? Math.floor(maxLoss / riskPerShare) : null;
  const idealValue  = idealShares ? idealShares * price : null;
  const currentValue = pos.mktValue ?? 0;
  const currentPct   = nav > 0 ? currentValue / nav : 0;

  return {
    stopEstimate:   +stop.toFixed(4),
    riskPerShare:   +riskPerShare.toFixed(4),
    idealShares,
    idealValue:     idealValue ? +idealValue.toFixed(2) : null,
    currentPct,
    oversized:      currentPct > CONCENTRATION_LIMIT,
    undersized:     idealValue !== null && currentValue < idealValue * 0.7,
    suggestion:     currentPct > CONCENTRATION_LIMIT
      ? `TRIM: position is ${fmtPct(currentPct)} of NAV (limit ${fmtPct(CONCENTRATION_LIMIT)}). Target ≤${fmtPct(CONCENTRATION_LIMIT)}.`
      : idealValue !== null && currentValue < idealValue * 0.7
      ? `POTENTIAL ADD: risk-based sizing supports up to $${fmt(idealValue)} (${fmtPct(idealValue/nav)} of NAV).`
      : "SIZE OK: within risk parameters.",
  };
}

function newsTradeIdea(ticker, news, snap) {
  if (!news.length) return null;
  const bullishKeywords = ["approval", "positive", "upgrade", "beat", "strong", "resubmission accepted", "data positive", "catalyst"];
  const bearishKeywords = ["CRL", "reject", "downgrade", "miss", "dilution", "offering", "lockup", "secondary"];

  let bullScore = 0, bearScore = 0;
  for (const n of news) {
    const text = (n.headline + " " + (n.summary ?? "")).toLowerCase();
    bullishKeywords.forEach((k) => { if (text.includes(k.toLowerCase())) bullScore++; });
    bearishKeywords.forEach((k) => { if (text.includes(k.toLowerCase())) bearScore++; });
  }

  const bias  = bullScore > bearScore ? "BULLISH" : bearScore > bullScore ? "BEARISH" : "NEUTRAL";
  const setup = bias === "BULLISH"
    ? "Gap-and-go if opens >prev close on volume. Fade if opens >10% gap with low volume."
    : bias === "BEARISH"
    ? "Expect selling. Consider trim pre-open if news is structural (dilution/CRL). Potential fade-the-gap-down if oversold."
    : "No clear directional bias from headlines. Hold and observe first 15 min.";

  return { bias, bullScore, bearScore, setup };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function loadLog() {
  if (!fs.existsSync(LOG_PATH)) {
    const blank = { meta: { version: "1.0", last_run: null, created: new Date().toISOString() }, runs: [] };
    fs.writeFileSync(LOG_PATH, JSON.stringify(blank, null, 2));
    return blank;
  }
  return JSON.parse(fs.readFileSync(LOG_PATH, "utf8"));
}
function saveLog(log) { fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2)); }
function lastRun(log) { return log.runs.length ? log.runs[log.runs.length - 1] : null; }
function tradingDaysUntil(dateStr) {
  if (!dateStr) return null;
  let days = 0, cursor = new Date();
  const target = new Date(dateStr);
  while (cursor < target) {
    cursor.setDate(cursor.getDate() + 1);
    const d = cursor.getDay();
    if (d !== 0 && d !== 6) days++;
  }
  return days;
}
function pctChange(a, b) { return (!b || b === 0) ? null : (a - b) / b; }
function fmt(n, d = 2)   { return n == null ? "N/A" : Number(n).toFixed(d); }
function fmtPct(n)        { return n == null ? "N/A" : (n * 100).toFixed(2) + "%"; }
function pad(s, n, r = false) { s = String(s ?? ""); return r ? s.padStart(n) : s.padEnd(n); }
function hr(char = "─", len = 72) { return char.repeat(len); }

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function run() {
  const startTime = new Date();
  console.log(hr("="));
  console.log(`IBKR PRE-MARKET RESEARCH & STRATEGY  —  ${startTime.toUTCString()}`);
  console.log("READ-ONLY MODE. Zero order placement. Research and strategy flags only.");
  console.log(hr("="));

  // 1. Load prior log
  const log   = loadLog();
  const prior = lastRun(log);
  const since = prior?.timestamp ?? null;
  console.log(`\nLast run: ${since ?? "none (first run)"}`);

  // 2. IBKR data
  let accountId, summary, positions, snapshotMap, trades;
  try {
    console.log("\nConnecting to IBKR Client Portal Gateway...");
    accountId  = await getAccountId();
    console.log(`  Account: ${accountId}`);
    [summary, positions, trades] = await Promise.all([
      getAccountSummary(accountId),
      getPositions(accountId),
      getRecentTrades(accountId),
    ]);
    const conids = positions.map((p) => p.conid).filter(Boolean);
    snapshotMap = conids.length ? await getMarketSnapshot(conids) : {};
    console.log(`  Positions: ${positions.length}  |  Recent trades: ${Array.isArray(trades) ? trades.length : 0}`);
  } catch (err) {
    console.error(`\n  [!] IBKR Gateway error: ${err.message}`);
    console.error("      Is Client Portal Gateway running? Start it and log in, then retry.");
    console.error("      Gateway: https://github.com/InteractiveBrokers/cpgateway\n");
    // Continue with empty data so we still output a report
    accountId   = ACCOUNT_ID ?? "UNKNOWN";
    summary     = {};
    positions   = [];
    snapshotMap = {};
    trades      = [];
  }

  // Parse account summary
  const nav      = parseFloat(summary?.netliquidation?.amount ?? summary?.NetLiquidation?.amount ?? 0);
  const cash     = parseFloat(summary?.totalcashvalue?.amount ?? summary?.TotalCashValue?.amount   ?? 0);
  const leverage = parseFloat(summary?.leverage_s?.amount     ?? summary?.Leverage_S?.amount       ?? 0);
  const dailyPnl = parseFloat(summary?.daytradesremaining?.amount ?? 0); // field varies by account type

  // 3. Per-position research
  const posReports = [];
  const flags      = [];

  for (const pos of positions) {
    const ticker   = pos.ticker ?? pos.symbol ?? "???";
    const conid    = pos.conid;
    const qty      = pos.position ?? 0;
    const avgCost  = pos.avgCost ?? 0;
    const mktPrice = pos.mktPrice ?? 0;
    const mktValue = pos.mktValue ?? 0;
    const unrlzdPnl= pos.unrealizedPnl ?? 0;
    const snap     = snapshotMap[conid] ?? null;
    const livePrice= snap?.last ?? mktPrice;

    // Prior snapshot
    const priorPos  = prior?.positions?.find((p) => p.ticker === ticker);
    const priorPrice= priorPos?.livePrice ?? priorPos?.mktPrice ?? null;
    const move      = pctChange(livePrice, priorPrice);

    // Concentration
    const concentration = nav > 0 ? mktValue / nav : null;

    // Catalyst
    const catalystDate = CATALYST_DATES[ticker] ?? priorPos?.catalystDate ?? null;
    const daysOut      = tradingDaysUntil(catalystDate);

    // Flags
    const tickerFlags = [];
    if (move !== null && Math.abs(move) >= PRICE_MOVE_THRESHOLD) {
      tickerFlags.push({ type: "PRICE_MOVE", detail: `${fmtPct(move)} since last run (${fmt(priorPrice)} → ${fmt(livePrice)})` });
    }
    if (concentration !== null && concentration > CONCENTRATION_LIMIT) {
      tickerFlags.push({ type: "CONCENTRATION", detail: `${fmtPct(concentration)} of NAV exceeds ${fmtPct(CONCENTRATION_LIMIT)} limit` });
    }
    if (daysOut !== null && daysOut <= CATALYST_WINDOW_DAYS) {
      tickerFlags.push({ type: "CATALYST_IMMINENT", detail: `${catalystDate} is ${daysOut} trading day(s) away` });
    }
    for (const f of tickerFlags) flags.push({ ticker, ...f });

    // Strategy modules (news stub — Claude fills these in via web search in the cron prompt)
    const news       = [];
    const levels     = supportResistanceLevels({ avgCost }, snap);
    const playbook   = catalystPlaybook(ticker, catalystDate, daysOut, news);
    const sizing     = riskSizing({ mktPrice: livePrice, mktValue, avgCost }, nav, snap);
    const tradeIdea  = newsTradeIdea(ticker, news, snap);

    posReports.push({
      ticker, conid, qty, avgCost, mktPrice, livePrice, mktValue, unrlzdPnl,
      move, concentration, catalystDate, daysOut,
      snap, levels, playbook, sizing, tradeIdea,
      news, flags: tickerFlags,
    });
  }

  // ---------------------------------------------------------------------------
  // 4. Append to log
  // ---------------------------------------------------------------------------
  const thisRun = {
    timestamp: startTime.toISOString(),
    account: { nav, cash, leverage, dailyPnl },
    positions: posReports.map((p) => ({
      ticker: p.ticker, qty: p.qty, avgCost: p.avgCost,
      livePrice: p.livePrice, mktValue: p.mktValue, unrlzdPnl: p.unrlzdPnl,
      concentration: p.concentration, catalystDate: p.catalystDate,
      flags: p.flags,
    })),
    flags,
  };
  log.runs.push(thisRun);
  log.meta.last_run = thisRun.timestamp;
  // Keep last 30 runs (30 trading days)
  if (log.runs.length > 30) log.runs = log.runs.slice(-30);
  saveLog(log);

  // ---------------------------------------------------------------------------
  // 5. Morning brief output
  // ---------------------------------------------------------------------------
  console.log("\n" + hr());
  console.log("ACCOUNT SUMMARY");
  console.log(hr());
  console.log(`  NAV:          $${fmt(nav)}`);
  console.log(`  Cash:         $${fmt(cash)}`);
  console.log(`  Leverage:     ${fmt(leverage)}x`);
  console.log(`  Max risk/pos: $${fmt(nav * MAX_RISK_PER_TRADE_PCT)} (${fmtPct(MAX_RISK_PER_TRADE_PCT)} of NAV — compounding rule)`);

  console.log("\n" + hr());
  console.log("POSITIONS");
  console.log(hr());
  if (!posReports.length) {
    console.log("  No open positions (or gateway not connected).");
  } else {
    console.log(
      `  ${pad("TICKER",8)} ${pad("QTY",6,true)} ${pad("AVG",8,true)} ${pad("LIVE",8,true)} ` +
      `${pad("MKT VAL",10,true)} ${pad("P&L",10,true)} ${pad("MOVE",8,true)} ${pad("%NAV",7,true)}`
    );
    console.log("  " + hr("·", 70));
    for (const p of posReports) {
      const flagMark = p.flags.length ? " ⚑" : "";
      console.log(
        `  ${pad(p.ticker + flagMark, 8)} ${pad(p.qty,6,true)} ${pad("$"+fmt(p.avgCost),8,true)} ` +
        `${pad("$"+fmt(p.livePrice),8,true)} ${pad("$"+fmt(p.mktValue),10,true)} ` +
        `${pad("$"+fmt(p.unrlzdPnl),10,true)} ${pad(fmtPct(p.move),8,true)} ${pad(fmtPct(p.concentration),7,true)}`
      );
    }
  }

  for (const p of posReports) {
    console.log("\n" + hr("─"));
    console.log(`STRATEGY: ${p.ticker}  |  Live: $${fmt(p.livePrice)}  |  Qty: ${p.qty}  |  Avg: $${fmt(p.avgCost)}`);
    console.log(hr("─"));

    // Levels
    console.log("  LEVELS");
    const lv = p.levels;
    if (lv.prevClose)  console.log(`    Prev close:    $${fmt(lv.prevClose)}`);
    if (lv.open)       console.log(`    Today open:    $${fmt(lv.open)}`);
    if (lv.vwapProxy)  console.log(`    VWAP proxy:    $${fmt(lv.vwapProxy)}`);
    if (lv.resistance) console.log(`    Resistance:    $${fmt(lv.resistance)}  (day high)`);
    if (lv.support)    console.log(`    Support:       $${fmt(lv.support)}   (day low)`);
    if (lv.avgCost)    console.log(`    Cost basis:    $${fmt(lv.avgCost)}`);

    // Risk sizing
    console.log("\n  RISK SIZING  (2% NAV rule — compounding)");
    const sz = p.sizing;
    console.log(`    Stop estimate: $${fmt(sz.stopEstimate)}`);
    console.log(`    Risk/share:    $${fmt(sz.riskPerShare)}`);
    if (sz.idealShares) console.log(`    Ideal shares:  ${sz.idealShares}  ($${fmt(sz.idealValue)})`);
    console.log(`    Current % NAV: ${fmtPct(sz.currentPct)}`);
    console.log(`    → ${sz.suggestion}`);

    // Catalyst playbook
    console.log("\n  CATALYST PLAYBOOK");
    if (p.catalystDate) console.log(`    Date: ${p.catalystDate}  (${p.daysOut ?? "?"} trading days)`);
    for (const line of p.playbook) console.log(`    • ${line}`);

    // Trade idea (populated by news in cron prompt)
    if (p.tradeIdea) {
      console.log("\n  OVERNIGHT TRADE IDEA");
      console.log(`    Bias: ${p.tradeIdea.bias}  (bull signals: ${p.tradeIdea.bullScore}, bear signals: ${p.tradeIdea.bearScore})`);
      console.log(`    Setup: ${p.tradeIdea.setup}`);
    }

    // Flags
    if (p.flags.length) {
      console.log("\n  ⚑ FLAGS");
      for (const f of p.flags) console.log(`    [${f.type}] ${f.detail}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Compounding scorecard
  // ---------------------------------------------------------------------------
  console.log("\n" + hr("="));
  console.log("COMPOUNDING SCORECARD");
  console.log(hr("="));
  const totalUnrld = posReports.reduce((s, p) => s + (p.unrlzdPnl ?? 0), 0);
  const priorNav   = prior?.account?.nav ?? null;
  const navChange  = pctChange(nav, priorNav);
  console.log(`  Unrealized P&L:   $${fmt(totalUnrld)}`);
  console.log(`  NAV vs last run:  ${navChange !== null ? fmtPct(navChange) : "N/A (first run)"}`);
  if (priorNav) {
    const sessions = log.runs.length;
    console.log(`  Tracked sessions: ${sessions}`);
    if (sessions >= 2) {
      const firstNav = log.runs[0]?.account?.nav;
      const totalReturn = pctChange(nav, firstNav);
      if (totalReturn !== null) console.log(`  Total return:     ${fmtPct(totalReturn)}  since tracking began`);
    }
  }
  console.log(`\n  Oversized positions:  ${flags.filter(f=>f.type==="CONCENTRATION").length}`);
  console.log(`  Imminent catalysts:   ${flags.filter(f=>f.type==="CATALYST_IMMINENT").length}`);
  console.log(`  Price-move alerts:    ${flags.filter(f=>f.type==="PRICE_MOVE").length}`);

  if (flags.length) {
    console.log("\n" + hr());
    console.log(`FLAGS REQUIRING DECISION TODAY  (${flags.length})`);
    console.log(hr());
    for (const f of flags) {
      const icon = { CATALYST_IMMINENT: "⚑", CONCENTRATION: "!", PRICE_MOVE: "~" }[f.type] ?? "·";
      console.log(`  [${icon}] ${pad(f.ticker,6)} ${f.type.padEnd(20)}  ${f.detail}`);
    }
  }

  console.log("\n" + hr("="));
  console.log("No trades have been placed. Awaiting your review.");
  console.log(hr("=") + "\n");
}

run().catch((err) => {
  console.error("PRE-MARKET RESEARCH ERROR:", err.message);
  process.exit(1);
});
