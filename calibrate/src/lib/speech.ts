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

let voiceCache: SpeechSynthesisVoice | null = null

function pickVoice(): SpeechSynthesisVoice | null {
  if (voiceCache) return voiceCache
  const voices = speechSynthesis.getVoices()
  // Prefer a UK male-ish voice for the Jarvis feel, fall back gracefully
  voiceCache =
    voices.find((v) => /en-GB/i.test(v.lang) && /male|daniel|arthur|george/i.test(v.name)) ??
    voices.find((v) => /en-GB/i.test(v.lang)) ??
    voices.find((v) => v.lang.startsWith('en')) ??
    null
  return voiceCache
}

export function speak(text: string) {
  if (!('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  // Strip markdown-ish noise before speaking
  const clean = text.replace(/[*_#`>]/g, '').replace(/\s+/g, ' ').slice(0, 600)
  const u = new SpeechSynthesisUtterance(clean)
  const v = pickVoice()
  if (v) u.voice = v
  u.rate = 1.04
  u.pitch = 0.92
  speechSynthesis.speak(u)
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) speechSynthesis.cancel()
}
