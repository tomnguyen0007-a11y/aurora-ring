// ————————————————————————————————————————————————————————
// GROUNDED KNOWLEDGE BASE
// Static, factual reference injected into Jarvis's context so it advises
// from Tom's actual plans and real domain data — not invented specifics.
// Sourced from: Ollie Duthie's CALIBRATE Training Club guides (Hybrid Blueprint,
// Fuelling Framework, Recovery Blueprint), Tom's golf diagnostic, and his
// personal-development library. Keep this factual; opinions belong in the prompt.
// ————————————————————————————————————————————————————————

import { foodDbForPrompt } from './foodDb'

export const KNOWLEDGE_GOLF = `GOLF DIAGNOSTIC (current, from coach analysis):
- Fairways hit: ~37% (leaks tee shots — ~4 lost balls/round driving compounding errors)
- Greens in regulation (GIR): ~37%
- Scramble rate: ~16% (short-game protection breaks down under stress → substituting one mistake for another)
- Handicap: 2.4, target = PLUS handicap by end of summer
THE STRATEGY (decouple self-worth from ball flight; target execution not results):
1. Off the tee: prioritise a stock, repeatable shot and a wider margin — eliminating the 4 lost balls/round is the single biggest scoring lever (double/triple bogeys early kill confidence).
2. "No-stress" course prep + mentality: pre-shot routine, commit to a target, accept outcome. Confidence is protected by process, not results.
3. Short game is the safety net: raising the 16% scramble rate protects the score when GIR is missed.
4. Practice weighting should mirror where strokes are lost: tee-shot dispersion + short-game scrambling over pure long-game range bashing.
Simulator (Wed/Fri): distance-control ladders + 12-inch putting gate drills. Sunday: on-course execution with coach.`

export const KNOWLEDGE_HYBRID = `TRAINING — Ollie Duthie's CALIBRATE Hybrid Blueprint (running + gym):
Philosophy: build an elite aerobic engine to support gym + life; NOT to become a pure runner. ~70-80% of weekly running is easy Zone 2 (aerobic base, minimal fatigue); layer small doses of tempo/speed; the long run is the weekly builder.
Max HR estimate: 207 − (0.7 × age). Zone 2 = conversational pace.
3 progressive tiers (8-week blocks): Tier 1 (2 runs + long run/wk), Tier 2 (3 runs + long), Tier 3 (4-5 runs + long, up to 120min long run).
5 gym workouts (high smart volume, compounds first, 1-2 reps in reserve):
- A PULL: Pull-ups/Lat Pulldown 4×8-10, Chest-supported Row 4×8-12, Cable Pullover 3×10-12, Rear Delt Fly 3×12-15, Hammer Curl 3×10-12, Preacher Curl 3×8-12, Cable Crunches 4×12
- B PUSH: Incline DB/BB Press 4×6-8, DB/Machine Press 4×8, Pec Deck 4×12-15, Lateral Raise 3×12-15, Dips 3×12-15, Rope Pushdown 3×10-15, finisher superset lateral raise×shoulder press to failure
- C LEGS: Leg Press 4×8-10, RDL 4×6-10, Bulgarian Split Squat 3×8-12/leg, Single-leg Ham Curl 3×10/leg, Calf Raise 4×12-20, Hanging Knee Raise 3×10-15, optional glute work
- D ARMS (supersets): Close-grip Dips, Alt DB Curl 4×8-12, Skull Crushers 4×8-12, Hammer Curl×Rope Pressdown, Preacher×Overhead Ext
- E SHOULDERS/CHEST/BACK: Seated DB Press 4×6-10, Incline Machine Press 4×10, Cable Lateral 4×12-15, Pec Dec×Reverse Pec Dec, Face Pulls×Shrugs
Warmups: raise temperature 5min, foam roll, dynamic mobility. Static stretching AFTER training. Deload occasionally.`

export const KNOWLEDGE_FUEL = `NUTRITION — Ollie Duthie's Fuelling Framework (evidence-based, g/kg not %):
- Protein anchor: 1.8-2.2 g/kg/day, spread over 3-5 feedings (~0.3-0.4 g/kg/meal). Stays stable daily.
- Carbs are the primary dial, periodised by DAY TYPE (g/kg/day):
  Recovery 2.5-3.5 · Lift 3.5-4.5 · Easy run 4.0-5.0 · Quality run 5.0-6.5 · Double day 6.0-7.5 · Long run 6.5-8.0
- Fat floor: 0.6-0.8 g/kg/day (~20-35% energy); rises slightly on low-carb days.
Example for 80kg: Lift day ≈ P160 C320 F56 ≈2425 kcal; Long run ≈ P152 C560 F48 ≈3280 kcal.
Timing: carbs before/during/after quality+long sessions. Long run >90min: 30-60 g carbs/h (up to ~90 g/h for long events). Post hard session if training again <8-24h: ~1 g/kg/h carbs + protein.
Hydration: 3L/day min + electrolytes; front-load early; ~0.4-0.8 L/h training; sodium 500-700 mg/L; drink to thirst (avoid hyponatremia). Sweat test: weigh pre/post a 1h+ run.
Whole-food emphasis, 80/20 rule. LOW-FODMAP / "vertical diet" staples digest easiest around training.`

export const KNOWLEDGE_RECOVERY = `RECOVERY — Ollie Duthie's Recovery Blueprint:
Hydration is the foundation (3L+ / day, front-loaded, electrolytes; cut fluids 1-2h before bed).
Nutrition is the "third training session." Protein every meal (~30-50g). Complex carbs AM + non-training meals; simple carbs pre/post training. 8 veg + 3-4 fruit servings/day. Fat ~30% for hormones.
Caffeine: 3-6 mg/kg ~60min pre key session (≤400mg/day WHO); half-life 6-8h so cut by midday to protect sleep; save for quality/long/hard days.
Alcohol: worst hit is recovery + sleep. Don't drink before key sessions; if social, ≤2 drinks, hydrate + electrolytes, choose vodka soda, precede an easy/rest day.
5 core supplements: Multivitamin (AM w/ food), Omega-3 EPA/DHA 500-1000mg (w/ fat), Vitamin D3, Creatine monohydrate 3-5g/day, Magnesium glycinate/threonate (PM for sleep).
Sleep target: strict 22:30 blackout → 06:30 wake (8h). Screens off, magnesium, wind-down.`

export const KNOWLEDGE_ECON = `ECONOMICS & TRADE (Tom is learning; use correctly, incl. Czech terms):
- Micro vs Macro: Micro = individuals/firms/specific markets; Macro = aggregates (national GDP, inflation, unemployment).
- B2B = Business-to-Business; B2C = Business-to-Consumer.
- Compound interest (složený úrok): interest on principal + accumulated interest. Interest rate = úroková sazba.
- Vendor/supplier = dodavatel; consumer = spotřebitel.
- Naval: "Earn with your mind, not your time." Seek specific knowledge, accountability, leverage (code, media, capital). Play long-term games with long-term people.`

export const KNOWLEDGE_BOOKS = `PERSONAL-DEVELOPMENT LIBRARY (Tom's reading list — reference accurately, never fabricate quotes):
- "The Changing World Order" (Ray Dalio): empires/reserve-currency cycles; debt, productivity, internal/external order. Big-picture macro for the AURORA/business lens.
- "The 48 Laws of Power" (Robert Greene): strategic/social power laws (e.g. never outshine the master; conceal intentions). Read as descriptive strategy, not moral prescription.
- "The 4-Hour Workweek" (Tim Ferriss): DEAL — Definition, Elimination (Pareto 80/20), Automation, Liberation. Outsourcing, lifestyle design, "mini-retirements."
- "Atomic Habits" (James Clear): 1% better daily; systems > goals; cue-craving-response-reward; habit stacking; identity-based habits ("cast a vote for who you want to become").
- "The Almanack of Naval Ravikant" (Eric Jorgenson): wealth without luck (leverage + specific knowledge), happiness as a skill/choice, peace over stimulation.
Themes Tom lives by: "Health, love, and mission — in that order." "A calm mind, a fit body, a house full of love — earned, not bought." "Mystery makes history." "The third door."`

export function fullKnowledge(): string {
  return [
    KNOWLEDGE_GOLF,
    KNOWLEDGE_HYBRID,
    KNOWLEDGE_FUEL,
    KNOWLEDGE_RECOVERY,
    KNOWLEDGE_ECON,
    KNOWLEDGE_BOOKS,
    foodDbForPrompt(),
  ].join('\n\n')
}
