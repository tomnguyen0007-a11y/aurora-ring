#!/usr/bin/env node
/**
 * Deterministic pre-market number-crunching for the IBKR routine.
 * Takes live account/position data on stdin (JSON), returns per-ticker
 * levels + 2% NAV risk-sizing bands + comparison against the prior run.
 * All news/catalyst research happens in the calling session, not here —
 * this script only touches numbers it can verify from the input.
 *
 * Input JSON shape:
 * {
 *   "nav_usd": number,
 *   "positions": [{
 *     "ticker": string, "shares": number, "avg_price": number,
 *     "mark_price": number, "market_value": number,
 *     "unrealized_pnl": number, "daily_pnl": number,
 *     "prior_close": number | null
 *   }],
 *   "prior_run": { "timestamp": string, "positions": [{ "ticker": string, "mark_price": number }] } | null
 * }
 */

const NAV_TRIM_THRESHOLD = 0.35;
const NAV_TARGET_RISK = 0.02;

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function pct(numerator, denominator) {
  if (!denominator) return null;
  return (numerator / denominator) * 100;
}

(async () => {
  const raw = await readStdin();
  const input = JSON.parse(raw);
  const { nav_usd, positions, prior_run } = input;

  const priorByTicker = new Map(
    (prior_run?.positions || []).map((p) => [p.ticker, p])
  );

  const results = positions.map((p) => {
    const navPct = pct(p.market_value, nav_usd);
    const gapPct = p.prior_close ? pct(p.mark_price - p.prior_close, p.prior_close) : null;
    const prior = priorByTicker.get(p.ticker);
    const sinceLastRunPct = prior ? pct(p.mark_price - prior.mark_price, prior.mark_price) : null;

    const overConcentrated = navPct !== null && navPct / 100 > NAV_TRIM_THRESHOLD;
    const targetValueAt2pct = NAV_TARGET_RISK * nav_usd;
    const trimToTargetShares = overConcentrated
      ? Math.max(0, p.shares - (NAV_TRIM_THRESHOLD * nav_usd) / p.mark_price)
      : 0;

    return {
      ticker: p.ticker,
      mark_price: p.mark_price,
      prior_close: p.prior_close,
      gap_pct: gapPct !== null ? Number(gapPct.toFixed(2)) : null,
      since_last_run_pct: sinceLastRunPct !== null ? Number(sinceLastRunPct.toFixed(2)) : null,
      market_value: p.market_value,
      nav_pct: navPct !== null ? Number(navPct.toFixed(2)) : null,
      unrealized_pnl: p.unrealized_pnl,
      daily_pnl: p.daily_pnl,
      risk: {
        over_35pct_nav: overConcentrated,
        trim_shares_to_reach_35pct: overConcentrated ? Number(trimToTargetShares.toFixed(2)) : 0,
        two_pct_nav_target_value_usd: Number(targetValueAt2pct.toFixed(2)),
      },
    };
  });

  process.stdout.write(JSON.stringify({ generated_from_nav_usd: nav_usd, positions: results }, null, 2));
})().catch((err) => {
  process.stderr.write(`premarket-research.js error: ${err.message}\n`);
  process.exit(1);
});
