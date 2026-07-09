#!/usr/bin/env node
// Pre-market research engine for Tom's IBKR pre-market routine.
// READ-ONLY: computes derived analytics from a positions/account snapshot.
// It never places, modifies, or queues orders.
//
// Usage:
//   node scripts/premarket-research.js <snapshot.json>
//
// <snapshot.json> is the raw shape returned by the IBKR MCP tools for one run:
//   {
//     "positions": [ ...get_account_positions().positions ],
//     "account_summary": { ...get_account_summary() }
//   }
//
// Reads memory/portfolio_log.json for the previous run (to diff prices/NAV
// weight), appends this run's computed entry, and writes the log back.
// Prints a summary table to stdout for the calling routine to fold into the
// morning brief.

const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '..', 'memory', 'portfolio_log.json');

const TRIM_NAV_PCT = 35; // trim target if a position exceeds this % of NAV
const UNDERSIZED_NAV_PCT = 5; // flag as undersized (candidate to add) below this

function loadSnapshot() {
  const snapshotPath = process.argv[2];
  if (!snapshotPath) {
    console.error('Usage: node premarket-research.js <snapshot.json>');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
}

function loadLog() {
  if (!fs.existsSync(LOG_PATH)) {
    return { meta: { last_run: null }, runs: [] };
  }
  return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
}

function findPriorPosition(log, contractId) {
  for (let i = log.runs.length - 1; i >= 0; i -= 1) {
    const match = (log.runs[i].positions || []).find(p => p.contract_id === contractId);
    if (match) return match;
  }
  return null;
}

function sizingFlag(navWeightPct) {
  if (navWeightPct > TRIM_NAV_PCT) return 'TRIM';
  if (navWeightPct < UNDERSIZED_NAV_PCT) return 'UNDERSIZED';
  return 'HOLD';
}

function computeRun(snapshot, log) {
  const nav = snapshot.account_summary.net_liquidation;
  const positions = snapshot.positions.map(p => {
    const prior = findPriorPosition(log, p.contract_id);
    const navWeightPct = nav ? (p.market_value / nav) * 100 : null;
    const gapPct = prior && prior.market_price
      ? ((p.market_price - prior.market_price) / prior.market_price) * 100
      : null;
    const costBasisDeltaPct = p.average_price
      ? ((p.market_price - p.average_price) / p.average_price) * 100
      : null;
    return {
      contract_id: p.contract_id,
      ticker: p.contract_description,
      position: p.position,
      market_price: p.market_price,
      average_price: p.average_price,
      market_value: p.market_value,
      unrealized_pnl: p.unrealized_pnl,
      nav_weight_pct: navWeightPct !== null ? Number(navWeightPct.toFixed(2)) : null,
      gap_pct_since_last_run: gapPct !== null ? Number(gapPct.toFixed(2)) : null,
      cost_basis_delta_pct: costBasisDeltaPct !== null ? Number(costBasisDeltaPct.toFixed(2)) : null,
      sizing_flag: navWeightPct !== null ? sizingFlag(navWeightPct) : null,
    };
  });

  return {
    timestamp: new Date().toISOString(),
    account_summary: snapshot.account_summary,
    positions,
  };
}

function printSummary(run) {
  console.log(`\nPre-market research run — ${run.timestamp}`);
  console.log(`Net liquidation: ${run.account_summary.net_liquidation} ${run.account_summary.currency}\n`);
  console.log(
    ['Ticker', 'Qty', 'Price', 'AvgCost', 'MktVal', 'NAV%', 'GapSinceLast%', 'Sizing']
      .join('\t')
  );
  run.positions.forEach(p => {
    console.log(
      [
        p.ticker,
        p.position,
        p.market_price,
        p.average_price,
        p.market_value.toFixed(2),
        p.nav_weight_pct,
        p.gap_pct_since_last_run,
        p.sizing_flag,
      ].join('\t')
    );
  });
  console.log('\nNo trades have been placed. Read-only research output above.\n');
}

function main() {
  const snapshot = loadSnapshot();
  const log = loadLog();
  const run = computeRun(snapshot, log);

  log.meta = { last_run: run.timestamp };
  log.runs.push(run);

  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));

  printSummary(run);
}

main();
