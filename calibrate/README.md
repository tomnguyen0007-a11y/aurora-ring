# CALIBRATE — Personal OS

A dark, liquid-glass personal operating system built around **The Blueprint** (Executive Operating System V5), with **Jarvis** — an AI chief of staff that sees every stat and can log, edit, plan and navigate the app for you.

## What's inside

- **Today** — execution timeline with check-offs, day progress ring, today's workout, macro meters, water, streaks, golf volume, evening systems audit (weight / sleep / blackout)
- **Jarvis** — chat + voice (mic in, spoken replies). Works **free out of the box** with a built-in command engine: `log 30 min putting`, `add eggs and oats to the list`, `weight 84.2`, `slept 8h`, `made $250`, `what's next?`, `protein today?`… Plug in an API key (Settings) for full conversation, deep planning and strategy — **Google Gemini free tier** (no cost) or **Anthropic Claude** (best quality). Keys stay on-device; calls go browser → provider directly.
- **Goals** — the 4 strategic pillars (87–90 kg physique · plus handicap · AURORA $1k/day · 22:30 blackout) with milestones
- **Training** — full gym split preloaded (Push/Arms, Pull/Core, Legs, Whole Upper) with per-set weight/rep logging + Thursday Zone 2 run log
- **Golf** — live practice timer per category (putting, chipping, long game, drills, simulator, on-course), weekly hour charts, handicap trend
- **Nutrition** — lean-bulk macro targets (3,600–3,900 kcal / 190–220 g protein), food log, hydration, full meal rotation matrix
- **Grocery, Notes & Tables, AURORA business command (tasks + revenue vs $1k/day), Books/reading streak, Markets (live crypto via CoinGecko; stocks + news with a free Finnhub key), Weekly schedule editor**

## Run it

```bash
cd calibrate
npm install
npm run dev        # local dev
npm run build      # production build → dist/
```

## Deploy (free)

A GitHub Actions workflow (`.github/workflows/deploy-calibrate.yml`) deploys to **GitHub Pages** on every push to `main` that touches `calibrate/`. One-time setup: repo **Settings → Pages → Source: GitHub Actions**. Then install it on your phone from the browser menu ("Add to Home Screen") — it's a PWA and works offline.

## Data

Everything lives in your browser (localStorage) — private by design. **Settings → Export backup** produces a JSON file; import it on another device to move your data. No account, no server.
