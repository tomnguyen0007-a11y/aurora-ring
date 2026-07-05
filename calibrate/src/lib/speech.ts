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

function cleanForSpeech(text: string): string {
  return text
    .replace(/[*_#`>~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900)
}

let currentAudio: HTMLAudioElement | null = null

/**
 * The real JARVIS voice — ElevenLabs neural TTS (user's key, free tier works).
 * Falls back to browser speech if the request fails.
 */
async function speakEleven(text: string, key: string, voiceId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        text: cleanForSpeech(text),
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.25 },
      }),
    })
    if (!res.ok) return false
    const blob = await res.blob()
    stopSpeaking()
    currentAudio = new Audio(URL.createObjectURL(blob))
    await currentAudio.play()
    return true
  } catch {
    return false
  }
}

function speakBrowser(text: string, preferredURI?: string) {
  if (!('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  // One single utterance — chunking causes stutter/gaps on most engines.
  const u = new SpeechSynthesisUtterance(cleanForSpeech(text))
  const v = resolveVoice(preferredURI)
  if (v) u.voice = v
  u.rate = 1.0
  u.pitch = 0.92
  u.volume = 1
  speechSynthesis.speak(u)
}

export function speak(text: string, preferredURI?: string, eleven?: { key: string; voiceId: string }) {
  if (eleven?.key) {
    speakEleven(text, eleven.key, eleven.voiceId || 'onwK4e9ZLuTAKqWW03F9').then((ok) => {
      if (!ok) speakBrowser(text, preferredURI)
    })
    return
  }
  speakBrowser(text, preferredURI)
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) speechSynthesis.cancel()
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
}
