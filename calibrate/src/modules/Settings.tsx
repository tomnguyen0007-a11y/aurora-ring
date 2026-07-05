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
              {s.profile.facts.map((f, i) => (
                <li key={i} className="group flex items-center gap-2 rounded-lg bg-black/25 px-3 py-2">
                  <span className="text-arc">•</span>
                  <span className="flex-1 text-sm text-ice">{f}</span>
                  <button className="opacity-0 transition-opacity group-hover:opacity-100" aria-label="Remove fact" onClick={() => s.removeFact(i)}>
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
        <p className="mt-2 text-[11px] text-fog">
          For the most authentic JARVIS, pick a British male voice. On iPhone, install "Daniel (Enhanced)" via Settings → Accessibility → Spoken Content → Voices. Voice input uses your browser's speech recognition (works best in Chrome).
        </p>
      </Panel>

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
