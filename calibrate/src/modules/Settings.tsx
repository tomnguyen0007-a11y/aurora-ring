import { BrainCircuit, Download, KeyRound, Play, Plus, RotateCcw, Trash2, Upload, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { HudLabel, Panel } from '../components/ui'
import { englishVoices, speak } from '../lib/speech'
import { useStore } from '../store/store'
import type { LlmProvider } from '../store/types'

export function Settings() {
  const s = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const exportData = () => {
    const raw = localStorage.getItem('calibrate-v1') ?? '{}'
    const blob = new Blob([raw], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `calibrate-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importData = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        JSON.parse(String(reader.result)) // validate
        localStorage.setItem('calibrate-v1', String(reader.result))
        location.reload()
      } catch {
        alert('Not a valid Calibrate backup file.')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="px-1">
        <h1 className="h-lumen text-3xl font-bold tracking-wide">SYSTEM CONFIG</h1>
        <p className="mt-1 text-sm text-haze">Keys, voice, and data control. Everything is stored on this device only.</p>
      </header>

      <Panel>
        <HudLabel>
          <BrainCircuit size={11} className="text-arc" /> Jarvis Memory — Who You Are
        </HudLabel>
        <p className="mb-3 text-xs text-fog">Everything here is fed to Jarvis so it knows you deeply. Edit freely — this is your memory, not a form.</p>
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="col-span-2 block sm:col-span-1">
              <span className="hud-label !mb-1 !text-[8px]">Name</span>
              <input
                className="field w-full"
                value={s.profile.name}
                onChange={(e) => {
                  s.setProfile({ name: e.target.value })
                  s.setSettings({ userName: e.target.value })
                }}
              />
            </label>
            <label className="block">
              <span className="hud-label !mb-1 !text-[8px]">Age</span>
              <input
                className="field num w-full"
                inputMode="numeric"
                value={s.profile.age ?? ''}
                onChange={(e) => s.setProfile({ age: e.target.value ? parseInt(e.target.value) : null })}
              />
            </label>
            <label className="col-span-2 block sm:col-span-2">
              <span className="hud-label !mb-1 !text-[8px]">Location</span>
              <input className="field w-full" value={s.profile.location} onChange={(e) => s.setProfile({ location: e.target.value })} />
            </label>
          </div>
          <label className="block">
            <span className="hud-label !mb-1 !text-[8px]">Identity — who you are & what you're building</span>
            <textarea className="field w-full" rows={2} value={s.profile.identity} onChange={(e) => s.setProfile({ identity: e.target.value })} />
          </label>
          <label className="block">
            <span className="hud-label !mb-1 !text-[8px]">Operating philosophy</span>
            <textarea className="field w-full" rows={2} value={s.profile.philosophy} onChange={(e) => s.setProfile({ philosophy: e.target.value })} />
          </label>
          <label className="block">
            <span className="hud-label !mb-1 !text-[8px]">Inspiration</span>
            <input className="field w-full" value={s.profile.inspiration} onChange={(e) => s.setProfile({ inspiration: e.target.value })} />
          </label>

          <div>
            <span className="hud-label !mb-1.5 !text-[8px]">Facts Jarvis always remembers</span>
            <ul className="space-y-1.5">
              {s.profile.facts.map((f) => (
                <li key={f.id} className="group flex items-center gap-2 rounded-lg bg-black/25 px-3 py-2">
                  <span className="text-arc">•</span>
                  <span className="flex-1 text-sm text-ice">{f.text}</span>
                  <button className="opacity-0 transition-opacity group-hover:opacity-100" aria-label="Remove fact" onClick={() => s.removeFact(f.id)}>
                    <Trash2 size={13} className="text-alert/70" />
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const form = e.currentTarget as HTMLFormElement
                const inp = form.elements.namedItem('fact') as HTMLInputElement
                if (!inp.value.trim()) return
                s.addFact(inp.value.trim())
                form.reset()
              }}
            >
              <input name="fact" className="field flex-1 !py-1.5 text-sm" placeholder="Add a fact Jarvis should know…" />
              <button className="btn !px-3" type="submit" aria-label="Add fact">
                <Plus size={15} />
              </button>
            </form>
          </div>
        </div>
      </Panel>

      <Panel>
        <HudLabel>
          <KeyRound size={11} className="text-signal" /> Jarvis — Advanced Brain
        </HudLabel>
        <p className="mb-3 text-xs leading-relaxed text-fog">
          Jarvis always works free with the built-in command engine (logging, editing, stats). Plug in an API key to
          unlock deep conversation, planning and strategy. Keys never leave this device — calls go directly from your
          browser to the provider.
        </p>
        <div className="mb-3 flex gap-1.5">
          {(['none', 'anthropic', 'gemini'] as LlmProvider[]).map((p) => (
            <button
              key={p}
              onClick={() => s.setSettings({ provider: p })}
              className={`btn flex-1 !text-xs ${s.settings.provider === p ? '!border-signal/60 !bg-signal/15 !text-signal' : ''}`}
            >
              {p === 'none' ? 'Built-in only' : p === 'anthropic' ? 'Claude' : 'Gemini (free tier)'}
            </button>
          ))}
        </div>
        {s.settings.provider === 'anthropic' && (
          <div className="space-y-2">
            <input
              className="field num w-full"
              type="password"
              placeholder="sk-ant-…  (console.anthropic.com)"
              value={s.settings.anthropicKey}
              onChange={(e) => s.setSettings({ anthropicKey: e.target.value.trim() })}
            />
            <input
              className="field num w-full"
              placeholder="Model"
              value={s.settings.anthropicModel}
              onChange={(e) => s.setSettings({ anthropicModel: e.target.value.trim() })}
            />
            <p className="text-[11px] text-fog">Best quality. Costs cents per conversation, billed to your Anthropic account.</p>
          </div>
        )}
        {s.settings.provider === 'gemini' && (
          <div className="space-y-2">
            <input
              className="field num w-full"
              type="password"
              placeholder="AI…  (aistudio.google.com — free API key)"
              value={s.settings.geminiKey}
              onChange={(e) => s.setSettings({ geminiKey: e.target.value.trim() })}
            />
            <input
              className="field num w-full"
              placeholder="Model"
              value={s.settings.geminiModel}
              onChange={(e) => s.setSettings({ geminiModel: e.target.value.trim() })}
            />
            <p className="text-[11px] text-fog">Google's free tier: generous daily quota at no cost — the free way to give Jarvis a real brain.</p>
          </div>
        )}
      </Panel>

      <Panel>
        <HudLabel>
          <Volume2 size={11} className="text-steel" /> Voice
        </HudLabel>
        <label className="flex items-center justify-between">
          <span className="text-sm text-haze">Jarvis speaks replies out loud</span>
          <button
            role="switch"
            aria-checked={s.settings.speakReplies}
            onClick={() => s.setSettings({ speakReplies: !s.settings.speakReplies })}
            className={`relative h-6 w-11 rounded-full border transition-colors ${
              s.settings.speakReplies ? 'border-signal/60 bg-signal/30' : 'border-edge-strong bg-black/40'
            }`}
          >
            <span
              className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-ice transition-all ${s.settings.speakReplies ? 'left-[calc(100%-1.25rem)]' : 'left-0.5'}`}
              style={{ height: '1.125rem', width: '1.125rem' }}
            />
          </button>
        </label>
        <VoicePicker />
        <div className="mt-4 border-t border-edge pt-4">
          <span className="hud-label !mb-1 block !text-[8px] text-signal">
            The REAL movie voice — ElevenLabs (free tier: ~10 min speech/month)
          </span>
          <p className="mb-2 text-[11px] leading-relaxed text-fog">
            Get a free key at elevenlabs.io → paste below. Jarvis switches to a cinematic neural British voice
            ("Daniel"). Falls back to the browser voice if the quota runs out.
          </p>
          <div className="flex gap-2">
            <input
              className="field num flex-1"
              type="password"
              placeholder="ElevenLabs API key (optional)"
              value={s.settings.elevenKey}
              onChange={(e) => s.setSettings({ elevenKey: e.target.value.trim() })}
            />
            <button
              className="btn"
              onClick={() =>
                speak(
                  'Good evening, sir. All systems are calibrated and standing by.',
                  s.settings.voiceURI,
                  s.settings.elevenKey ? { key: s.settings.elevenKey, voiceId: s.settings.elevenVoiceId } : undefined,
                  s.settings.openaiKey,
                )
              }
            >
              <Play size={14} /> Test
            </button>
          </div>
        </div>
        <div className="mt-4 border-t border-edge pt-4">
          <span className="hud-label !mb-1 block !text-[8px]">Backup neural voice — OpenAI TTS (optional)</span>
          <p className="mb-2 text-[11px] leading-relaxed text-fog">
            Used automatically when ElevenLabs is unset or out of quota, before falling back to the robotic browser
            voice. Any OpenAI API key works.
          </p>
          <input
            className="field num w-full"
            type="password"
            placeholder="OpenAI API key (optional)"
            value={s.settings.openaiKey ?? ''}
            onChange={(e) => s.setSettings({ openaiKey: e.target.value.trim() })}
          />
        </div>
        <div className="mt-4 border-t border-edge pt-4">
          <label className="flex items-center justify-between">
            <span className="text-sm text-haze">Reminders when nutrition / audit is behind (while app is open)</span>
            <button
              role="switch"
              aria-checked={s.settings.notifyEnabled}
              onClick={async () => {
                if (!s.settings.notifyEnabled && 'Notification' in window && Notification.permission === 'default') {
                  await Notification.requestPermission()
                }
                s.setSettings({ notifyEnabled: !s.settings.notifyEnabled })
              }}
              className={`relative h-6 w-11 rounded-full border transition-colors ${
                s.settings.notifyEnabled ? 'border-signal/60 bg-signal/30' : 'border-edge-strong bg-black/40'
              }`}
            >
              <span
                className={`absolute top-0.5 rounded-full bg-ice transition-all ${s.settings.notifyEnabled ? 'left-[calc(100%-1.25rem)]' : 'left-0.5'}`}
                style={{ height: '1.125rem', width: '1.125rem' }}
              />
            </button>
          </label>
        </div>
        <p className="mt-2 text-[11px] text-fog">
          For the browser voice, pick a British male above. On iPhone, install "Daniel (Enhanced)" via Settings →
          Accessibility → Spoken Content → Voices. Voice input works best in Chrome.
        </p>
      </Panel>

      <IntegrationsPanel />

      <Panel>
        <HudLabel>Markets & News</HudLabel>
        <div className="space-y-3">
          <label className="block">
            <span className="hud-label !mb-1 !text-[8px]">Finnhub API key — free at finnhub.io (stocks + market news)</span>
            <input
              className="field num w-full"
              type="password"
              placeholder="optional"
              value={s.settings.finnhubKey}
              onChange={(e) => s.setSettings({ finnhubKey: e.target.value.trim() })}
            />
          </label>
          <label className="block">
            <span className="hud-label !mb-1 !text-[8px]">GNews API key — free at gnews.io (world / politics / local news)</span>
            <input
              className="field num w-full"
              type="password"
              placeholder="optional — 100 requests/day free"
              value={s.settings.gnewsKey}
              onChange={(e) => s.setSettings({ gnewsKey: e.target.value.trim() })}
            />
          </label>
        </div>
      </Panel>

      <Panel>
        <HudLabel>Data Control</HudLabel>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={exportData}>
            <Download size={15} /> Export backup
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> Import backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])}
          />
          {confirmReset ? (
            <button
              className="btn btn-danger"
              onClick={() => {
                s.resetAll()
                setConfirmReset(false)
              }}
            >
              Really reset everything?
            </button>
          ) : (
            <button className="btn btn-danger" onClick={() => setConfirmReset(true)}>
              <RotateCcw size={15} /> Factory reset
            </button>
          )}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-fog">
          All data lives in this browser (localStorage). Export a backup before clearing browser data, and import it on
          your other devices to move data between phone and desktop.
        </p>
      </Panel>
    </div>
  )
}

function IntegrationsPanel() {
  const s = useStore()
  const hevyRef = useRef<HTMLInputElement>(null)
  const golfRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const [syncing, setSyncing] = useState(false)

  const syncHevy = async () => {
    if (!s.settings.hevyKey) return setMsg('Paste your Hevy API key first (Hevy app → Settings → Developer → API key).')
    setSyncing(true)
    setMsg('')
    try {
      const { fetchHevyWorkouts } = await import('../lib/imports')
      const sessions = await fetchHevyWorkouts(s.settings.hevyKey)
      s.setHevySessions(sessions)
      setMsg(`Synced ${sessions.length} workouts live from Hevy. They count toward your weekly lifts.`)
    } catch (e) {
      setMsg(
        `${e instanceof Error ? e.message : 'Sync failed'}. If this keeps happening, use the CSV import below — same data, always works.`,
      )
    } finally {
      setSyncing(false)
    }
  }

  const importHevy = async (file: File) => {
    const { parseHevyCSV } = await import('../lib/imports')
    const sessions = parseHevyCSV(await file.text())
    if (!sessions.length) return setMsg('Could not find workouts in that file — export the CSV from Hevy → Settings → Export Data.')
    s.setHevySessions(sessions)
    setMsg(`Imported ${sessions.length} Hevy workouts. They now count toward your weekly lifts.`)
  }

  const importGolfshot = async (file: File) => {
    const { parseGolfshotCSV } = await import('../lib/imports')
    const rounds = parseGolfshotCSV(await file.text())
    if (!rounds.length) return setMsg('Could not find rounds in that file — export rounds as CSV from Golfshot (golfshot.com → Rounds → Export).')
    s.setGolfRounds(rounds)
    const avg = Math.round(rounds.slice(0, 20).reduce((a, r) => a + r.score, 0) / Math.min(rounds.length, 20))
    s.setGolfStats({ avgScore: avg })
    setMsg(`Imported ${rounds.length} rounds. Average score updated to ${avg}.`)
  }

  return (
    <Panel>
      <HudLabel>Integrations — Hevy & Golfshot</HudLabel>

      <span className="hud-label !mb-1 block !text-[8px] text-arc">Hevy — live sync (official API)</span>
      <p className="mb-2 text-[11px] leading-relaxed text-fog">
        In the Hevy app: Settings → Developer → generate API key (requires Hevy Pro). Paste it and hit Sync — your
        workouts pull straight in.
      </p>
      <div className="mb-4 flex gap-2">
        <input
          className="field num flex-1"
          type="password"
          placeholder="Hevy API key"
          value={s.settings.hevyKey}
          onChange={(e) => s.setSettings({ hevyKey: e.target.value.trim() })}
        />
        <button className="btn btn-signal" onClick={syncHevy} disabled={syncing}>
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>

      <span className="hud-label !mb-1 block !text-[8px]">CSV imports (no subscription needed)</span>
      <p className="mb-2 text-[11px] leading-relaxed text-fog">
        <span className="text-haze">Hevy:</span> Profile → Settings → Export Data.{' '}
        <span className="text-haze">Golfshot:</span> golfshot.com → Rounds → Export (no public API exists).
        Re-import any time; it replaces the previous import.
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="btn" onClick={() => hevyRef.current?.click()}>
          <Upload size={15} /> Hevy CSV
          {s.hevySessions.length > 0 && <span className="num text-xs text-affirm">({s.hevySessions.length})</span>}
        </button>
        <button className="btn" onClick={() => golfRef.current?.click()}>
          <Upload size={15} /> Golfshot CSV
          {s.golfRounds.length > 0 && <span className="num text-xs text-affirm">({s.golfRounds.length})</span>}
        </button>
        <input ref={hevyRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && importHevy(e.target.files[0])} />
        <input ref={golfRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && importGolfshot(e.target.files[0])} />
      </div>
      {msg && <p className="mt-3 rounded-lg bg-black/25 px-3 py-2 text-xs text-steel">{msg}</p>}
    </Panel>
  )
}

function VoicePicker() {
  const s = useStore()
  const [voices, setVoices] = useState(() => englishVoices())

  useEffect(() => {
    const refresh = () => setVoices(englishVoices())
    refresh()
    // voices load asynchronously in most browsers
    if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = refresh
    return () => {
      if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = null
    }
  }, [])

  if (!voices.length) return null

  return (
    <div className="mt-3 flex items-end gap-2">
      <label className="block flex-1">
        <span className="hud-label !mb-1 !text-[8px]">JARVIS voice</span>
        <select
          className="field w-full"
          value={s.settings.voiceURI}
          onChange={(e) => s.setSettings({ voiceURI: e.target.value })}
          aria-label="Choose voice"
        >
          <option value="" className="bg-panel">
            Auto — best British male
          </option>
          {voices.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI} className="bg-panel">
              {v.name} ({v.lang})
            </option>
          ))}
        </select>
      </label>
      <button
        className="btn"
        onClick={() => speak('Good evening, sir. All systems are calibrated and standing by.', s.settings.voiceURI)}
      >
        <Play size={14} /> Test
      </button>
    </div>
  )
}
