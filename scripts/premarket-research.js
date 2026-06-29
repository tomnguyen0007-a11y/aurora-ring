#!/usr/bin/env node
// Pre-market research scaffold — live data pulled via IBKR MCP tools by Claude
// This script is a placeholder; actual data collection runs through Claude + IBKR MCP

const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '../memory/portfolio_log.json');

function loadLog() {
  if (!fs.existsSync(LOG_PATH)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
}

const log = loadLog();
if (!log) {
  console.log('No prior log found — first run.');
} else {
  console.log(`Last run: ${log.meta.last_run}`);
  console.log(`NAV (EUR): ${log.account.nav_eur}`);
  console.log('Positions:');
  log.positions.forEach(p => {
    console.log(`  ${p.ticker}: ${p.shares} shares @ $${p.avg_cost_usd} cost | Last: $${p.last_price_usd} | PnL: $${p.unrealized_pnl_usd.toFixed(2)} (${p.unrealized_pct}%) | ${p.pct_nav}% NAV`);
  });
}
