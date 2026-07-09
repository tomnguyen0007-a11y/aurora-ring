# Aurora Ring / Calibrate — Project Brief

## What this is
Calibrate is Tom's personal operating system — a dark, liquid-glass PWA covering
training, golf, nutrition, recovery, business, reading, and schedule, all in one
place. Jarvis is the AI chief of staff inside it: it sees every stat live, can
log/edit/delete/schedule/remember/navigate on command, reads photos, and has
web search — a local pattern-matching engine handles common commands for free,
with an LLM (Claude / Gemini / Groq / OpenRouter, in that failover order) for
open-ended conversation and planning once a key is added in Settings.

## The mission
Aurora Ring is the commercial project this app supports: the goal is $1,000/day
revenue. Every output tied to it — design, copy, code, campaigns — is judged on
whether it's conversion-focused, visually sharp, and production-ready. The
AURORA module in Calibrate tracks business tasks and revenue against that
$1k/day target directly.

## The four pillars (from Goals)
1. **Physique** — 87–90 kg lean, built on Ollie Duthie's CALIBRATE Hybrid
   Blueprint (aerobic-engine-first running + 5-day gym split).
2. **Golf** — plus handicap by end of summer, via the golf diagnostic
   (fairways/GIR/scramble tracked live) and Ollie Duthie's coaching strategy.
3. **AURORA** — $1,000/day revenue.
4. **Discipline** — 22:30 blackout / recovery routine.

These already ride along with every Jarvis query automatically via LIVE STATE
and the built-in KNOWLEDGE base (golf diagnostic, hybrid training blueprint,
fuelling framework, recovery blueprint) — this brief exists to add the
*business/product* context that isn't captured by those live stats.

## How Jarvis gets smarter over time
- **Brain Feed** (Settings) — paste or upload any note directly; it rides along
  with every query, budget ~14k characters, newest first.
- **GitHub Sync** (Settings) — points at a repo + optional folder and pulls
  markdown/text straight in, no copy-paste. This repo's `calibrate/notes/`
  folder is the intended drop zone: anything added there becomes part of
  Jarvis's grounded knowledge on the next sync.
- The `/ECC` directory in this repo is a separate Claude Code development
  toolkit (agents/skills/rules used when *building* this app) — it is not
  personal or business content and isn't meant to be synced into Jarvis's
  Brain Feed; keep GitHub Sync scoped to `calibrate/notes` rather than the
  repo root to avoid pulling in thousands of unrelated framework files.
