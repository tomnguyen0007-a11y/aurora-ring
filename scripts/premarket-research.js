#!/usr/bin/env node
// Pre-market research script — prints account/position summary from portfolio_log.json
const fs = require('fs');
const path = require('path');

const logPath = path.join(__dirname, '..', 'memory', 'portfolio_log.json');

if (!fs.existsSync(logPath)) {
  console.error('portfolio_log.json not found — run full routine first.');
  process.exit(1);
}

const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
const { meta, account, positions, macro } = log;

console.log('=== AURORA RING PRE-MARKET RESEARCH ===');
console.log(`Last run : ${meta.last_run}`);
console.log(`Date     : ${new Date().toISOString().split('T')[0]}`);
console.log('');
console.log('--- ACCOUNT ---');
console.log(`NAV (USD)         : $${account.nav_usd.toFixed(2)}`);
console.log(`Cash (USD)        : $${account.cash_usd.toFixed(2)}`);
console.log(`Positions value   : $${account.gross_position_value_usd.toFixed(2)}`);
console.log(`Unrealized P&L    : $${account.unrealized_pnl_usd.toFixed(2)}`);
console.log('');
console.log('--- POSITIONS ---');
for (const p of positions) {
  const gap = p.prior_close ? (((p.last_price - p.prior_close) / p.prior_close) * 100).toFixed(2) : 'N/A';
  console.log(`${p.ticker.padEnd(6)} | ${p.shares} sh | avg $${p.avg_cost.toFixed(2)} | last $${p.last_price} | gap ${gap}% | MV $${p.market_value_usd.toFixed(2)} | uPnL $${p.unrealized_pnl.toFixed(2)} | NAV% ${p.nav_pct}%`);
}
console.log('');
console.log('--- MACRO ---');
console.log(`ES Futures : ${macro.es_futures_pct}%`);
console.log(`NQ Futures : ${macro.nq_futures_pct}%`);
console.log(`Bias       : ${macro.bias}`);
