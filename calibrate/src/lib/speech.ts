// Web Speech API — free voice in/out, no server, works best in Chrome.

type RecognitionCtor = new () => SpeechRecognitionLike

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

export function speechSupported(): boolean {
  const w = window as unknown as Record<string, unknown>
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition)
}

export function createRecognizer(onFinal: (text: string) => void, onEnd: () => void): SpeechRecognitionLike | null {
  const w = window as unknown as Record<string, unknown>
  const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as RecognitionCtor | undefined
  if (!Ctor) return null
  const rec = new Ctor()
  rec.lang = 'en-US'
  rec.interimResults = false
  rec.maxAlternatives = 1
  rec.continuous = false
  rec.onresult = (e) => {
    const last = e.results[e.results.length - 1]
    if (last?.[0]?.transcript) onFinal(last[0].transcript.trim())
  }
  rec.onend = onEnd
  rec.onerror = onEnd
  return rec
}

/** All available English voices, British first — for the Settings picker. */
export function englishVoices(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return []
  const all = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang))
  return all.sort((a, b) => {
    const score = (v: SpeechSynthesisVoice) => (/en-GB/i.test(v.lang) ? 0 : /en-US/i.test(v.lang) ? 1 : 2)
    return score(a) - score(b)
  })
}

// Best-guess "JARVIS" voice: a refined British male. Ranked preference list.
const JARVIS_VOICE_PREFS = [
  /daniel/i, // Apple UK male (great match)
  /arthur/i,
  /oliver/i,
  /george/i,
  /google uk english male/i,
  /uk english male/i,
  /en-GB.*male/i,
]

function autoPick(): SpeechSynthesisVoice | null {
  const voices = englishVoices()
  for (const pref of JARVIS_VOICE_PREFS) {
    const hit = voices.find((v) => pref.test(v.name) || pref.test(`${v.lang} ${v.name}`))
    if (hit) return hit
  }
  return voices.find((v) => /en-GB/i.test(v.lang)) ?? voices[0] ?? null
}

/** Resolve the voice to use: user's chosen URI, else the best British male. */
export function resolveVoice(preferredURI?: string): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null
  if (preferredURI) {
    const chosen = speechSynthesis.getVoices().find((v) => v.voiceURI === preferredURI)
    if (chosen) return chosen
  }
  return autoPick()
}

export function speak(text: string, preferredURI?: string) {
  if (!('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  // Strip markdown/emoji noise, and pace with commas for a smoother, less robotic read.
  const clean = text
    .replace(/[*_#`>~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700)
  // Split into sentence-ish chunks so the engine breathes naturally between clauses.
  const chunks = clean.match(/[^.!?]+[.!?]?/g) ?? [clean]
  const v = resolveVoice(preferredURI)
  chunks.forEach((chunk, i) => {
    const u = new SpeechSynthesisUtterance(chunk.trim())
    if (v) u.voice = v
    u.rate = 0.98 // measured, deliberate — the JARVIS cadence
    u.pitch = 0.9 // lower, composed
    u.volume = 1
    if (i > 0) u.text = ' ' + u.text
    speechSynthesis.speak(u)
  })
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) speechSynthesis.cancel()
}
