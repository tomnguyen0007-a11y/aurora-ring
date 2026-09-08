/* ═══════════════════════════════════════════════════════════════════
   INPUT NORMALISATION

   The local engine is ~30 hand-written regexes matched against raw
   text. That is fast, free and offline, but it is also brittle in
   exactly the way a phone keyboard is brittle: "protien 40g", "30m gf"
   and "2l h2o" all mean something obvious and all miss every pattern.

   This runs first and rewrites the message into the vocabulary the
   regexes were written against. Three passes, cheapest first:

     1. shape   — case, unicode punctuation, decimal commas, "30m" → "30 min"
     2. alias   — a domain dictionary: gf → golf, wtr → water, sesh → session
     3. fuzzy   — Levenshtein ≤ threshold against domain words only, so
                  "protien" → "protein" but "protean" is left alone

   Only whole tokens are touched, and only against a closed vocabulary,
   so ordinary English is never mangled on its way to the model.
   ═══════════════════════════════════════════════════════════════════ */

/** Multi-word phrases collapse first — order matters, longest wins. */
const PHRASES: [RegExp, string][] = [
  [/\bwork\s?out\b/g, 'workout'],
  [/\bh\s?2\s?o\b/g, 'water'],
  [/\bshort\s?game\b/g, 'chipping'],
  [/\blong\s?game\b/g, 'long-game'],
  [/\bon\s?course\b/g, 'on-course'],
  [/\bbody\s?weight\b/g, 'weight'],
  [/\bpb\b/g, 'personal best'],
]

/** token → canonical token. Keys must be lowercase and whole words. */
const ALIASES: Record<string, string> = {
  // golf
  gf: 'golf', golfing: 'golf', putt: 'putting', putts: 'putting', chip: 'chipping',
  chips: 'chipping', drill: 'drills', sim: 'simulator',
  // training
  wo: 'workout', sesh: 'session', sess: 'session',
  rn: 'run', jog: 'run', jogged: 'run',
  // fuel
  wtr: 'water', h20: 'water', prot: 'protein', protien: 'protein', prtn: 'protein',
  cal: 'calories', cals: 'calories', kcals: 'calories', carb: 'carbs', fats: 'fat',
  brekkie: 'breakfast', bfast: 'breakfast', lunchy: 'lunch',
  // units
  m: 'min', mins: 'min', minute: 'min', minutes: 'min', hr: 'hour', hrs: 'hour',
  hours: 'hour', kgs: 'kg', kilos: 'kg', kilo: 'kg', litre: 'l', litres: 'l',
  liter: 'l', liters: 'l', grams: 'g', gram: 'g',
  // life
  wt: 'weight', slept: 'sleep', kip: 'sleep', hcp: 'handicap',
  groceries: 'grocery', shopping: 'grocery',
  rev: 'revenue', sale: 'revenue', sales: 'revenue',
  tmr: 'tomorrow', tmrw: 'tomorrow', tdy: 'today', yday: 'yesterday',
  // intent verbs
  lg: 'log', logg: 'log', pls: 'please', plz: 'please',
}

/**
 * Function words fuzzy matching must never touch. Without this, "that" sits one
 * edit from "what" and every "make that 800 kcal" / "delete that meal" silently
 * becomes a question. Correctness here matters more than coverage: a missed
 * typo costs one LLM round-trip, a corrupted sentence costs a wrong action.
 */
const KEEP = new Set([
  'that', 'this', 'what', 'when', 'with', 'from', 'have', 'been', 'then', 'than', 'they',
  'them', 'were', 'will', 'your', 'yours', 'also', 'just', 'like', 'make', 'made', 'some',
  'more', 'most', 'over', 'into', 'only', 'much', 'many', 'need', 'want', 'does', 'done',
  'said', 'take', 'took', 'time', 'well', 'back', 'good', 'know', 'about', 'after', 'before',
  'still', 'there', 'their', 'these', 'those', 'would', 'could', 'should', 'here', 'each',
  'both', 'same', 'other', 'right', 'left', 'next', 'last', 'first', 'was', 'not', 'and',
])

/** The closed vocabulary fuzzy matching is allowed to correct towards. */
const VOCAB = [
  'golf', 'putting', 'chipping', 'long-game', 'simulator', 'on-course', 'drills', 'handicap',
  'workout', 'session', 'training', 'run', 'running', 'reps', 'sets', 'exercise',
  'water', 'protein', 'calories', 'carbs', 'fat', 'breakfast', 'lunch', 'dinner', 'snack',
  'weight', 'sleep', 'energy', 'recovery', 'blackout', 'reading', 'grocery', 'revenue',
  'schedule', 'blueprint', 'habit', 'streak', 'target', 'today', 'tomorrow', 'yesterday',
  'log', 'add', 'remove', 'delete', 'update', 'set', 'show', 'what', 'when', 'plan',
]

/**
 * Optimal string alignment distance — Levenshtein plus adjacent transposition
 * as a single edit. Transposition matters here: "wieght" and "portein" are the
 * most common way a thumb mistypes, and plain Levenshtein scores them 2, which
 * would force a ceiling loose enough to start corrupting real words. Bails out
 * as soon as the running minimum exceeds max.
 */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1
  let two: number[] = []
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, two[j - 2] + 1)
      }
      cur[j] = v
      if (v < best) best = v
    }
    if (best > max) return max + 1
    two = prev
    prev = cur
  }
  return prev[b.length]
}

/** Correct a token towards the vocabulary, or leave it exactly as it was. */
export function correct(token: string): string {
  if (token.length < 4) return token // too short to disambiguate safely
  if (KEEP.has(token)) return token // ordinary English is never "corrected"
  if (VOCAB.includes(token)) return token
  const max = token.length >= 7 ? 2 : 1
  let best: string | null = null
  let bestD = max + 1
  for (const w of VOCAB) {
    const d = editDistance(token, w, max)
    if (d < bestD) {
      bestD = d
      best = w
    } else if (d === bestD) {
      best = null // ambiguous — two words are equally close, so change nothing
    }
  }
  return best && bestD <= max ? best : token
}

/**
 * Rewrite a message into the engine's vocabulary. Returns the raw text
 * unchanged when nothing matched, so the caller can tell whether it helped.
 */
export function normalise(input: string): string {
  let t = input
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‒-―]/g, '-')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

  // "1,5 l" → "1.5 l" (decimal comma only; a thousands comma keeps its digits)
  t = t.replace(/(\d),(\d)(?!\d{2}\b)/g, '$1.$2')
  // "30m" / "45min" / "2h" → spaced, so the unit patterns see a boundary
  t = t.replace(/(\d)\s*(m|min|mins|h|hr|hrs|kg|km|g|ml|l)\b/g, '$1 $2')

  for (const [re, to] of PHRASES) t = t.replace(re, to)

  return t
    .split(' ')
    .map((tok) => {
      const bare = tok.replace(/[^\w'-]/g, '')
      if (!bare) return tok
      const mapped = ALIASES[bare] ?? correct(bare)
      return mapped === bare ? tok : tok.replace(bare, mapped)
    })
    .join(' ')
}
