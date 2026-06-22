# AURORA — Design Strategy Brief (distilled from ECC)

Hand this to any design agent (Claude Code with the repo, or Klaviyo cowork without it).
It applies ECC `frontend-design-direction` + `design-quality` to AURORA so the output
stops looking flat and templated.

---

## STEP 0 — If you have the repo, read these first
- `ECC/skills/frontend-design-direction/SKILL.md`
- `ECC/rules/web/design-quality.md`
- `ECC/skills/design-system/SKILL.md`
- `ECC/skills/marketing-campaign/SKILL.md`
- `ECC/skills/email-ops/SKILL.md`

Then, BEFORE designing, state: style direction · palette · type · 1 memorable detail.

---

## DESIGN DIRECTION (locked)
- **Purpose:** sell the AURORA ring (€109, no subscription) via email.
- **Audience:** health/recovery-minded buyers comparing Oura/WHOOP.
- **Tone:** **dark luxury, editorial** — Oura-grade restraint, not a discount blast.
- **Memorable detail:** the product photo floats seamlessly on true black; one white
  highlight row in the comparison is the only "bright" moment.

## PALETTE (intentional, multi-tonal — not one-note)
- Base black `#000000` · elevated surface `#0B0B0B` · hairline `#1C1C1C`
- Text: white `#FFFFFF` → `#9A9A9A` → `#5A5A5A` (three tiers, real hierarchy)
- Accent: restrained — white is the accent. Optional cool steel `#6E8CC0` used ONCE max.

## TYPOGRAPHY
- Inter. Headlines **weight 600** (NOT 800/900 — heavy caps read cheap), tight tracking
  (-1 to -1.6px), large. Body 400, `#9A9A9A`. Labels: 11px, 2–3px letter-spacing, uppercase.

## NON-NEGOTIABLES (ECC banned patterns — do NOT do)
- ❌ Flat color-block layout with no depth (THIS is what made past versions look "ass")
- ❌ Uniform padding/radius everywhere · ❌ shouty 900-weight caps
- ❌ gray-on-white with one decorative accent · ❌ generic centered hero + blob

## REQUIRED (hit 4+)
1. Scale contrast hierarchy  2. Non-uniform spacing rhythm  3. **Depth/atmosphere**
4. Type with character  5. Semantic color  6. Designed hover/focus states
7. Editorial/bento composition  8. **Texture/atmosphere via real art assets**

## THE KEY FIX — use real art, not CSS blocks
To match reference-grade emails (Recess/Oura), background and hero sections must be
**actual designed images**, full-bleed:
- A composed **hero graphic**: ring floating on a graded black-to-charcoal field with a
  soft rim-light glow (a rendered PNG, not a CSS gradient).
- Optional **section background art**: subtle dark texture/grain or a soft radial light.
- Product shots **composited** with the metric callouts (Deep Sleep, HRV, SpO₂, Stress,
  Vitality Score) like the product hero — not plain text grids.

Generate these with an image tool (Higgsfield/Midjourney/Figma), host them, and place as
`<img>` / VML background images with a `bgcolor="#000000"` fallback.

## COPY (locked, from the live listing)
- H1: **Your body. Deeply understood.**
- Sub: Sleep, HRV, blood oxygen and skin temperature — tracked continuously from titanium.
- Price: €109 · Black/Silver/Gold · sizes 6–13 · No subscription, ever.
- Close: **Wear the data.**
- Product URL: https://auroraring.store/products/aurora-ring

## ASSETS (real, from Shopify CDN — shop 0999/8427/7830)
- Logo (white, for dark bg): `.../files/aurora_logo_transparent_3d1e1281-...png`
- Hero: `.../files/IMG_9592.webp?v=1776632627`
- Lifestyle: `.../files/IMG_9632.webp?v=1776633768`
