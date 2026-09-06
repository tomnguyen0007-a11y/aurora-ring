# Calibrate v8 port — merge brief

You are porting the **v8 redesign** onto **today's `main`**. Two versions of each module exist and
both contain work that must survive.

- **main's version** (features): `git show origin/main:calibrate/src/modules/<X>.tsx`
  run from `/Users/tomnguyen/aurora-ring`
- **v8's version** (design + flexibility): `/tmp/v8ref/calibrate/src/modules/<X>.tsx`
- **The file you edit**: `/Users/tomnguyen/aurora-ring/calibrate/src/modules/<X>.tsx`
  (it currently holds main's version)

## The rule

**Keep every feature main has. Present it in v8's language.** If main can do something v8's version
cannot, that capability must exist in your output. If v8 renders something in a way main did not,
your output renders it v8's way.

Never delete a feature to make a merge easier. If you cannot see how to express one of main's
features in v8's vocabulary, keep it working with the closest v8 primitive and leave a one-line
comment saying so.

## v8's design law (non-negotiable)

- Monochrome only: `#000`, `#0a0a0a`, `#111`, `#fff`, plus white at low alpha. **No hue, ever.**
  Any `text-signal`, `text-ice`, `text-fog`, `border-edge`, `bg-black/25`, `glass`, `ring-*` colour
  class from the old theme is gone — those tokens no longer exist and will render unstyled.
- Structure comes from whitespace and 1px hairlines at ≤14% alpha (`border-line`, `border-line-2`).
  **No card backgrounds, no gradients, no drop shadows, no blur, no rounded floating panels.**
  Prefer `border-b border-line` rows over boxes.
- Type: one family. Colour tokens are `text-paper` (white), `text-mute`, `text-dim`, `text-faint`,
  `text-ghost`. Sizes are `text-micro / text-label / text-body / text-lede / text-head / text-title`.
  Numerals get `className="num"` (tabular figures).
- Glow (`.glow`) is a scalpel: at most one glowing element per screen.
- Controls must be reachable on touch — never hide an action behind `opacity-0 group-hover` without
  an `lg:` prefix.

## v8 component vocabulary — `src/components/ui.tsx`

`Page({title, lede?, actions?})` · `Section({label?, aside?, id?})` · `Eyebrow` · `Row` ·
`Tools` · `IconBtn({glyph, label, onClick})` · `Reorder({onUp,onDown,first,last})` ·
`DangerBtn({onConfirm, label?, glyph?})` · `InlineText({value,onChange,ariaLabel,...})` ·
`InlineArea` · `NumCell({value,onChange,ariaLabel,...})` · `Stat({label,value,sub?,strong?})` ·
`Bar({pct})` · `Track({label,value,min,max,unit?})` · `Ring({pct,size?,focal?})` ·
`Spark({points,width?,height?})` · `Cols` · `Chain` · `Dot({checked,onToggle,label?,size?})` ·
`Toggle` · `Chip` · `Empty` · `Sheet` · `Scroller`

Old→new mapping when you meet main's code:
`Panel`→`Section`, `HudLabel`→`Eyebrow`, `StatTile`→`Stat`, `Meter`→`Track`,
`Sparkline`→`Spark`, `Bars`→ a `Chain`/`Spark`/hairline bar row, `CheckDot`→`Dot`,
`InlineEdit({value,onSave,num})`→`InlineText({value,onChange,ariaLabel,mono})`.

## Icons

`lucide-react` is **removed from the project**. Import from `../components/icons` instead:
`import { Icon } from '../components/icons'` → `<Icon name="plus" size={15} />`, or use `IconBtn`.
Run `grep -o "^  [a-z-]*:" src/components/icons.tsx` to see the available glyph names; pick the
closest one rather than inventing a name.

## Store API changes you must respect

- Golf/meal/business/schedule **taxonomies are editable data with stable ids**. There is no
  `GOLF_CATEGORIES` constant any more — read `s.golfCategories` (`{id, label}[]`), and likewise
  `s.blockTags`, `s.bizAreas`, `s.mealWindows`. A log row stores the **id**; render the label by
  looking it up. Type annotate lambda params (`(c: Taxon) => …`) — `noImplicitAny` is on.
- Knowledge docs: `s.knowledgeDocs`, `addKnowledgeDoc(title, body?, source?, pinned?)`,
  `updateKnowledgeDoc(id, patch)`, `removeKnowledgeDoc(id)`, `toggleKnowledgePin(id)`.
- Photos: `s.trainingPhotos`, `addTrainingPhoto`, `updateTrainingPhoto`, `removeTrainingPhoto`
  (blobs live in IndexedDB — `src/lib/photoDb.ts`).
- Golf timer: `s.golfTimer`, `startGolfTimer(categoryId)`, `pauseGolfTimer()`, `resumeGolfTimer()`,
  `stopGolfTimer()`. Elapsed time is derived from wall-clock stamps — never reintroduce an
  interval-counter timer.
- Day-type macros: `s.dayTypeMacros`, `updateDayTypeMacro(code, patch)`.
- `TAG_COLORS` is gone (monochrome). Distinguish tags by label and hairline weight, not colour.
- Every module component takes `{ label }: { label: string }` and passes it to `<Page title={label}>`
  — section names are user-editable, so never hard-code a page title.

## Definition of done

- `npx tsc -b --pretty false` reports **no errors for your file**.
- Every feature present in main's version is present in yours.
- No old-theme colour class, no `lucide-react` import, no `GOLF_CATEGORIES`.
- Do not touch any file other than the one you were assigned.
