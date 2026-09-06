import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Icon, PICKABLE_GLYPHS, type GlyphName } from '../components/icons'
import {
  Chip,
  DangerBtn,
  Empty,
  Eyebrow,
  IconBtn,
  InlineArea,
  InlineText,
  NumCell,
  Page,
  Reorder,
  Section,
  Toggle,
  Tools,
} from '../components/ui'
import { downloadBackup, isCalibrateBackup, restoreBackup } from '../lib/backup'
import { fileToMark } from '../lib/brand'
import { WEEKDAY_NAMES } from '../lib/dates'
import { syncGithubKnowledge } from '../lib/jarvis/githubSync'
import { testProvider } from '../lib/jarvis/llm'
import { notifyPermission, requestNotifyPermission } from '../lib/notify'
import { englishVoices, speak } from '../lib/speech'
import { getSyncStatus, subscribeSyncStatus, syncNow } from '../lib/supabase'
import { useStore } from '../store/store'
import type { LlmProvider, Weekday } from '../store/types'

/* Settings is where the app becomes yours: navigation, habits, reminders,
   memory and the second-brain library all live here as editable data. */

/* Settings is long by nature — it holds every knob in the app. This index
   keeps it navigable instead of a scroll marathon. */
const SETTINGS_INDEX = [
  ['set-brand', 'Brand'],
  ['set-navigation', 'Navigation'],
  ['set-jarvis', 'Jarvis'],
  ['set-consistency', 'Consistency'],
  ['set-memory', 'Memory'],
  ['set-github', 'GitHub'],
  ['set-voice', 'Voice'],
  ['set-sync', 'Sync'],
  ['set-integrations', 'Integrations'],
  ['set-sources', 'Sources'],
  ['set-data', 'Data'],
] as const

function SettingsIndex() {
  return (
    <div className="no-bar -mx-5 mb-10 flex gap-1 overflow-x-auto px-5 sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
      {SETTINGS_INDEX.map(([id, label]) => (
        <button
          key={id}
          type="button"
          className="btn btn-sm shrink-0"
          onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/* ── Brand ───────────────────────────────────────────────────────────
   The mark, the wordmark and the tab icon are yours. Drop in any SVG or
   PNG; it is stored with your state and never leaves your devices. */
function BrandSection() {
  const s = useStore()
  const ref = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState('')

  const pick = async (file: File) => {
    setErr('')
    try {
      const { dataUrl } = await fileToMark(file)
      s.setSettings({ brandMark: dataUrl })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not read that file.')
    }
  }

  return (
    <Section label="Brand">
      <p className="mb-5 max-w-2xl text-body text-faint">
        Your mark, your wordmark, your tab icon. SVG or PNG, up to 512px — it replaces the default everywhere and rides
        along with sync. Nothing is uploaded anywhere.
      </p>

      <div className="flex flex-wrap items-center gap-6 border-b border-line pb-6">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center border border-line">
          {s.settings.brandMark ? (
            <img
              src={s.settings.brandMark}
              alt="Current mark"
              className="max-h-12 max-w-12 object-contain"
              style={{ filter: s.settings.brandInvert ? 'invert(1)' : undefined }}
            />
          ) : (
            <Icon name="jarvis" size={22} className="text-faint" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-sm" onClick={() => ref.current?.click()}>
            {s.settings.brandMark ? 'Replace mark' : 'Upload mark'}
          </button>
          {s.settings.brandMark && (
            <>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => s.setSettings({ brandInvert: !s.settings.brandInvert })}
              >
                {s.settings.brandInvert ? 'Un-invert' : 'Invert'}
              </button>
              <DangerBtn onConfirm={() => s.setSettings({ brandMark: undefined, brandInvert: false })} label="Remove" />
            </>
          )}
          <input
            ref={ref}
            type="file"
            accept="image/*,.svg"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && void pick(e.target.files[0])}
          />
        </div>
        {err && <span className="text-micro text-paper">{err}</span>}
      </div>

      <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
        <label className="flex items-baseline justify-between gap-3 border-b border-line py-3">
          <Eyebrow>Wordmark</Eyebrow>
          <input
            className="field-line flex-1 text-right text-body text-paper"
            value={s.settings.brandName ?? ''}
            placeholder="CALIBRATE"
            aria-label="Wordmark"
            onChange={(e) => s.setSettings({ brandName: e.target.value })}
          />
        </label>
        <label className="flex items-baseline justify-between gap-3 border-b border-line py-3">
          <Eyebrow>Sub-line</Eyebrow>
          <input
            className="field-line flex-1 text-right text-body text-paper"
            value={s.settings.brandTagline ?? ''}
            placeholder="PERSONAL OS"
            aria-label="Sub-line"
            onChange={(e) => s.setSettings({ brandTagline: e.target.value })}
          />
        </label>
      </div>
    </Section>
  )
}


/* ── GitHub sync ─────────────────────────────────────────────────────
   Point it at an Obsidian vault, the ECC skills repo, project docs —
   markdown lands in the Brain Feed with no copy-paste. */
function GithubSyncPanel() {
  const s = useStore()
  const [state, setState] = useState<{ status: 'idle' | 'syncing' | 'ok' | 'fail'; message: string }>({
    status: 'idle',
    message: '',
  })
  const syncedCount = s.knowledgeDocs.filter((d) => d.source.startsWith('github:')).length

  const run = async () => {
    setState({ status: 'syncing', message: '' })
    const res = await syncGithubKnowledge()
    setState({ status: res.ok ? 'ok' : 'fail', message: res.message })
  }

  return (
    <Section label="GitHub sync — pull notes straight from a repo">
      <p className="mb-5 max-w-2xl text-body text-faint">
        An Obsidian vault you push to GitHub, the ECC skills repo, project docs — any markdown or text syncs into the
        reference library above. Public repos need no token; private ones need a{' '}
        <a
          href="https://github.com/settings/tokens"
          target="_blank"
          rel="noreferrer"
          className="text-mute underline underline-offset-2 hover:text-paper"
        >
          personal access token
        </a>{' '}
        with repo read access.
      </p>

      <div className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="field"
            placeholder="owner/repo"
            aria-label="GitHub repository"
            value={s.settings.githubRepo ?? ''}
            onChange={(e) => s.setSettings({ githubRepo: e.target.value })}
          />
          <input
            className="field"
            placeholder="branch (main)"
            aria-label="Branch"
            value={s.settings.githubBranch ?? ''}
            onChange={(e) => s.setSettings({ githubBranch: e.target.value })}
          />
        </div>
        <input
          className="field w-full"
          placeholder="Optional folder filter — e.g. skills/ (blank syncs the whole repo)"
          aria-label="Folder filter"
          value={s.settings.githubPath ?? ''}
          onChange={(e) => s.setSettings({ githubPath: e.target.value })}
        />
        <input
          className="field num w-full"
          type="password"
          placeholder="Personal access token — only for private repos or higher rate limits"
          aria-label="GitHub token"
          value={s.settings.githubToken ?? ''}
          onChange={(e) => s.setSettings({ githubToken: e.target.value })}
        />
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void run()}
            disabled={state.status === 'syncing' || !s.settings.githubRepo}
          >
            {state.status === 'syncing' ? 'Syncing…' : 'Sync now'}
          </button>
          {state.status === 'ok' && <span className="text-micro text-paper">{state.message}</span>}
          {state.status === 'fail' && <span className="text-micro text-mute">{state.message}</span>}
          {state.status === 'idle' && (
            <span className="text-micro text-faint">
              {syncedCount > 0
                ? `${syncedCount} file${syncedCount === 1 ? '' : 's'} synced${
                    s.settings.githubSyncedAt ? ` · last sync ${new Date(s.settings.githubSyncedAt).toLocaleString()}` : ''
                  }`
                : 'Not synced yet'}
            </span>
          )}
        </div>
      </div>
    </Section>
  )
}

function TestButton({ provider }: { provider: LlmProvider }) {
  const [state, setState] = useState<{ status: 'idle' | 'testing' | 'ok' | 'fail'; message: string }>({ status: 'idle', message: '' })
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className="btn btn-sm"
        disabled={state.status === 'testing'}
        onClick={async () => {
          setState({ status: 'testing', message: '' })
          const res = await testProvider(provider)
          setState({ status: res.ok ? 'ok' : 'fail', message: res.message })
        }}
      >
        {state.status === 'testing' ? 'Testing…' : 'Test connection'}
      </button>
      {state.status === 'ok' && <span className="text-micro text-paper">{state.message}</span>}
      {state.status === 'fail' && (
        <span className="text-micro text-faint" title={state.message}>
          {state.message.slice(0, 64)}
        </span>
      )}
    </div>
  )
}

function NavigationPanel() {
  const s = useStore()
  const [iconFor, setIconFor] = useState<string | null>(null)

  return (
    <Section
      label="Navigation"
      aside={
        <>
          <button className="btn btn-sm" onClick={() => s.addGroup('New group')}>
            + Group
          </button>
          <button className="btn btn-sm" onClick={() => s.addSection({ label: 'New section', module: 'custom', icon: 'custom' })}>
            + Section
          </button>
          <DangerBtn onConfirm={s.resetSections} label="Reset navigation" glyph="refresh" />
        </>
      }
    >
      <p className="mb-6 max-w-2xl text-body text-faint">
        Rename anything, move it between groups, reorder it, hide what you don't use, or invent new sections. Hiding a
        built-in section keeps its data; deleting is only offered for pages you created.
      </p>

      <div className="space-y-8">
        {[...s.groups]
          .sort((a, b) => a.order - b.order)
          .map((g) => {
            const items = s.sections.filter((x) => x.group === g.id).sort((a, b) => a.order - b.order)
            return (
              <div key={g.id}>
                <div className="group mb-2 flex items-center gap-3 border-b border-line-2 pb-2">
                  <InlineText value={g.label} onChange={(v) => s.updateGroup(g.id, { label: v })} ariaLabel="Group name" className="eyebrow w-40" />
                  <span className="num flex-1 text-micro text-ghost">{items.length}</span>
                  <Tools>
                    <DangerBtn onConfirm={() => s.removeGroup(g.id)} label={`Delete ${g.label}`} />
                  </Tools>
                </div>
                <ul>
                  {items.map((sec, i) => (
                    <li key={sec.id} className="group border-b border-line py-2.5 last:border-b-0">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setIconFor(iconFor === sec.id ? null : sec.id)}
                          aria-label="Change icon"
                          className="p-1 text-faint transition-colors hover:text-paper"
                        >
                          <Icon name={(sec.icon as GlyphName) ?? 'custom'} size={15} />
                        </button>
                        <span className="min-w-0 flex-1">
                          <InlineText
                            value={sec.label}
                            onChange={(v) => s.updateSection(sec.id, { label: v })}
                            ariaLabel="Section name"
                            className={`text-body ${sec.hidden ? 'text-faint line-through' : 'text-paper'}`}
                          />
                        </span>
                        <select
                          className="field !py-1 hidden text-micro sm:block"
                          value={sec.group}
                          aria-label="Group"
                          onChange={(e) => s.updateSection(sec.id, { group: e.target.value })}
                        >
                          {s.groups.map((gr) => (
                            <option key={gr.id} value={gr.id}>
                              {gr.label}
                            </option>
                          ))}
                        </select>
                        <Chip active={sec.bar} onClick={() => s.updateSection(sec.id, { bar: !sec.bar })}>
                          Bar
                        </Chip>
                        <IconBtn
                          glyph={sec.hidden ? 'eyeOff' : 'eye'}
                          label={sec.hidden ? 'Show section' : 'Hide section'}
                          onClick={() => s.updateSection(sec.id, { hidden: !sec.hidden })}
                        />
                        <Tools>
                          <Reorder onUp={() => s.moveSection(sec.id, -1)} onDown={() => s.moveSection(sec.id, 1)} first={i === 0} last={i === items.length - 1} />
                          {sec.module === 'custom' && <DangerBtn onConfirm={() => s.removeSection(sec.id)} label={`Delete ${sec.label}`} />}
                        </Tools>
                      </div>
                      {iconFor === sec.id && (
                        <div className="mt-3 flex flex-wrap gap-1.5 pl-8">
                          {PICKABLE_GLYPHS.map((gl) => (
                            <button
                              key={gl}
                              onClick={() => {
                                s.updateSection(sec.id, { icon: gl })
                                setIconFor(null)
                              }}
                              aria-label={`Use ${gl} icon`}
                              className={`border p-1.5 transition-colors ${sec.icon === gl ? 'border-paper text-paper' : 'border-line text-faint hover:text-paper'}`}
                            >
                              <Icon name={gl} size={14} />
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
      </div>
    </Section>
  )
}

function ConsistencyPanel() {
  const s = useStore()
  const [perm, setPerm] = useState(notifyPermission())

  return (
    <>
      <Section
        label="Habits"
        aside={
          <button className="btn btn-sm" onClick={() => s.addHabit('New habit')}>
            + Habit
          </button>
        }
      >
        <p className="mb-5 max-w-2xl text-body text-faint">
          These drive the day score and the streaks. Where a habit has a natural source — water, protein, reading, the
          session — it reads from your real logs, so there is never a second place to record the same thing.
        </p>
        <ul>
          {[...s.habits]
            .sort((a, b) => a.order - b.order)
            .map((h, i) => (
              <li key={h.id} className="group flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-b-0">
                <span className="min-w-[8rem] flex-1">
                  <InlineText value={h.label} onChange={(v) => s.updateHabit(h.id, { label: v })} ariaLabel="Habit name" className="text-body text-paper" />
                </span>
                <select
                  className="field !py-1 text-micro"
                  value={h.kind}
                  aria-label="Habit type"
                  onChange={(e) => s.updateHabit(h.id, { kind: e.target.value as 'boolean' | 'count' })}
                >
                  <option value="boolean">Done / not</option>
                  <option value="count">Count to target</option>
                </select>
                {h.kind === 'count' && (
                  <span className="flex items-baseline gap-1">
                    <NumCell value={h.target} onChange={(v) => s.updateHabit(h.id, { target: v ?? 1 })} ariaLabel="Target" width="w-12" />
                    <span className="w-10">
                      <InlineText value={h.unit} onChange={(v) => s.updateHabit(h.id, { unit: v })} ariaLabel="Unit" placeholder="unit" className="text-micro text-faint" />
                    </span>
                  </span>
                )}
                <Tools>
                  <Reorder onUp={() => s.moveHabit(h.id, -1)} onDown={() => s.moveHabit(h.id, 1)} first={i === 0} last={i === s.habits.length - 1} />
                  <DangerBtn onConfirm={() => s.removeHabit(h.id)} label={`Delete ${h.label}`} />
                </Tools>
              </li>
            ))}
        </ul>
      </Section>

      <Section
        label="Reminders"
        aside={
          <button className="btn btn-sm" onClick={() => s.addReminder({ label: 'New reminder', time: '09:00' })}>
            + Reminder
          </button>
        }
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
          <div className="max-w-xl">
            <div className="text-body text-paper">Scheduled reminders</div>
            <p className="mt-1 text-micro leading-relaxed text-faint">
              These fire while Calibrate is open or installed to your home screen. Install it as a PWA on iPhone — Share
              → Add to Home Screen — and it can nudge you with the app in the background. There is no push server behind
              a static site, so this is deliberately honest about its limits.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {perm !== 'granted' && (
              <button
                className="btn btn-sm"
                onClick={async () => {
                  const ok = await requestNotifyPermission()
                  setPerm(ok ? 'granted' : notifyPermission())
                  if (ok) s.setSettings({ remindersEnabled: true })
                }}
              >
                Allow notifications
              </button>
            )}
            <Toggle
              on={s.settings.remindersEnabled}
              onChange={async (v) => {
                if (v && notifyPermission() !== 'granted') {
                  const ok = await requestNotifyPermission()
                  setPerm(ok ? 'granted' : notifyPermission())
                  if (!ok) return
                }
                s.setSettings({ remindersEnabled: v })
              }}
              label="Enable reminders"
            />
          </div>
        </div>

        <ul>
          {s.reminders.map((r) => (
            <li key={r.id} className="group border-b border-line py-3 last:border-b-0">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="time"
                  className="field num !py-1 w-24"
                  value={r.time}
                  aria-label="Reminder time"
                  onChange={(e) => s.updateReminder(r.id, { time: e.target.value })}
                />
                <span className="min-w-[8rem] flex-1">
                  <InlineText value={r.label} onChange={(v) => s.updateReminder(r.id, { label: v })} ariaLabel="Reminder name" className="text-body text-paper" />
                </span>
                <Toggle on={r.enabled} onChange={(v) => s.updateReminder(r.id, { enabled: v })} label={`Enable ${r.label}`} />
                <Tools>
                  <DangerBtn onConfirm={() => s.removeReminder(r.id)} label={`Delete ${r.label}`} />
                </Tools>
              </div>
              <InlineText
                value={r.body}
                onChange={(v) => s.updateReminder(r.id, { body: v })}
                ariaLabel="Reminder message"
                placeholder="What it should say…"
                className="mt-1.5 text-micro text-faint"
              />
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {WEEKDAY_NAMES.map((n, i) => {
                  const on = r.days.length === 0 || r.days.includes(i as Weekday)
                  return (
                    <Chip
                      key={n}
                      active={on}
                      onClick={() => {
                        const current = r.days.length ? r.days : ([0, 1, 2, 3, 4, 5, 6] as Weekday[])
                        const next = current.includes(i as Weekday) ? current.filter((d) => d !== i) : [...current, i as Weekday]
                        s.updateReminder(r.id, { days: next.length === 7 ? [] : (next.sort() as Weekday[]) })
                      }}
                    >
                      {n.slice(0, 2)}
                    </Chip>
                  )
                })}
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </>
  )
}

function MemoryPanel() {
  const s = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [openDoc, setOpenDoc] = useState<string | null>(null)

  const importMarkdown = async (files: FileList) => {
    for (const file of Array.from(files).slice(0, 40)) {
      const text = await file.text()
      s.addKnowledgeDoc(file.name.replace(/\.(md|markdown|txt)$/i, ''), text, file.name)
    }
  }

  return (
    <>
      <Section label="Who you are">
        <p className="mb-5 max-w-2xl text-body text-faint">
          Everything here rides along in Jarvis's context. Write it as you would brief a chief of staff, not as a form.
        </p>
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <label className="flex items-baseline justify-between gap-3 border-b border-line py-3">
            <Eyebrow>Name</Eyebrow>
            <input
              className="field-line flex-1 text-right text-body text-paper"
              value={s.profile.name}
              aria-label="Name"
              onChange={(e) => {
                s.setProfile({ name: e.target.value })
                s.setSettings({ userName: e.target.value })
              }}
            />
          </label>
          <label className="flex items-baseline justify-between gap-3 border-b border-line py-3">
            <Eyebrow>Location</Eyebrow>
            <input
              className="field-line flex-1 text-right text-body text-paper"
              value={s.profile.location}
              aria-label="Location"
              onChange={(e) => s.setProfile({ location: e.target.value })}
            />
          </label>
        </div>
        <div className="mt-5 space-y-5">
          <div>
            <Eyebrow className="mb-2">Identity — who you are and what you're building</Eyebrow>
            <InlineArea value={s.profile.identity} onChange={(v) => s.setProfile({ identity: v })} ariaLabel="Identity" />
          </div>
          <div>
            <Eyebrow className="mb-2">Operating philosophy</Eyebrow>
            <InlineArea value={s.profile.philosophy} onChange={(v) => s.setProfile({ philosophy: v })} ariaLabel="Philosophy" />
          </div>
        </div>
      </Section>

      <Section label={`Memory · ${s.profile.facts.length} facts`}>
        <p className="mb-5 max-w-2xl text-body text-faint">
          What Jarvis has committed to memory. Edit or delete any of it — importance decides what surfaces first.
        </p>
        <ul>
          {s.profile.facts.map((f) => (
            <li key={f.id} className="group flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
              <span className="eyebrow w-16 shrink-0">{f.category}</span>
              <span className="min-w-0 flex-1">
                <InlineText value={f.text} onChange={(v) => s.updateFact(f.id, { text: v })} ariaLabel="Memory fact" className="text-body text-paper" />
              </span>
              <NumCell value={f.importance} onChange={(v) => s.updateFact(f.id, { importance: Math.max(1, Math.min(10, v ?? 5)) })} ariaLabel="Importance" width="w-8" />
              <Tools>
                <DangerBtn onConfirm={() => s.removeFact(f.id)} label="Forget this" />
              </Tools>
            </li>
          ))}
        </ul>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const input = e.currentTarget.elements.namedItem('fact') as HTMLInputElement
            if (!input.value.trim()) return
            s.addFact(input.value.trim())
            input.value = ''
          }}
        >
          <input name="fact" className="field min-w-0 flex-1" placeholder="Something Jarvis should always know…" aria-label="New fact" />
          <button className="btn" type="submit">
            Remember
          </button>
        </form>
      </Section>

      <Section
        label={`Reference library · ${s.knowledgeDocs.length}`}
        aside={
          <>
            <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>
              Import markdown
            </button>
            <button className="btn btn-sm" onClick={() => setOpenDoc(s.addKnowledgeDoc('New document', '', 'manual'))}>
              + Document
            </button>
          </>
        }
      >
        <p className="mb-5 max-w-2xl text-body text-faint">
          Your second brain, inside the app. Drop in markdown from your vault and Jarvis reads it — pinned documents ride
          along every message, the rest surface when a question actually touches them.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && importMarkdown(e.target.files)}
        />
        {s.knowledgeDocs.length ? (
          <ul>
            {s.knowledgeDocs.map((k) => (
              <li key={k.id} className="group border-b border-line py-3 last:border-b-0">
                <div className="flex items-center gap-3">
                  <IconBtn glyph="pin" label="Always include" active={k.pinned} onClick={() => s.updateKnowledgeDoc(k.id, { pinned: !k.pinned })} />
                  <span className="min-w-0 flex-1">
                    <InlineText value={k.title} onChange={(v) => s.updateKnowledgeDoc(k.id, { title: v })} ariaLabel="Document title" className="text-body text-paper" />
                  </span>
                  <span className="num shrink-0 text-micro text-ghost">{Math.round(k.body.length / 100) / 10}k</span>
                  <IconBtn glyph={openDoc === k.id ? 'chevronUp' : 'chevronDown'} label="Toggle body" onClick={() => setOpenDoc(openDoc === k.id ? null : k.id)} />
                  <Tools>
                    <DangerBtn onConfirm={() => s.removeKnowledgeDoc(k.id)} label={`Delete ${k.title}`} />
                  </Tools>
                </div>
                {openDoc === k.id && (
                  <div className="mt-3 border-l border-line pl-4">
                    <InlineArea value={k.body} onChange={(v) => s.updateKnowledgeDoc(k.id, { body: v })} ariaLabel="Document body" minRows={6} placeholder="Paste your notes…" />
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nothing filed yet. Import a folder of markdown and Jarvis inherits it.</Empty>
        )}
      </Section>
    </>
  )
}

function SyncPanel() {
  const s = useStore()
  const status = useSyncExternalStore(subscribeSyncStatus, getSyncStatus)
  const [syncing, setSyncing] = useState(false)
  const configured = !!(s.settings.supabaseUrl && s.settings.supabaseKey && s.settings.syncCode)

  return (
    <Section label="Cross-device sync">
      <p className="mb-5 max-w-2xl text-body text-faint">
        Everything — logs, memory, sections, chat — through your own free Supabase project. Paste the same three values
        on every device. Setup is in SUPABASE.md in the repo.
      </p>
      <div className="space-y-2">
        <input className="field w-full" placeholder="Supabase project URL" value={s.settings.supabaseUrl ?? ''} onChange={(e) => s.setSettings({ supabaseUrl: e.target.value.trim() })} aria-label="Supabase URL" />
        <input className="field num w-full" type="password" placeholder="Supabase anon key" value={s.settings.supabaseKey ?? ''} onChange={(e) => s.setSettings({ supabaseKey: e.target.value.trim() })} aria-label="Supabase key" />
        <div className="flex gap-2">
          <input className="field num min-w-0 flex-1" placeholder="Sync code — identical on every device" value={s.settings.syncCode ?? ''} onChange={(e) => s.setSettings({ syncCode: e.target.value.trim() })} aria-label="Sync code" />
          <button className="btn" type="button" onClick={() => s.setSettings({ syncCode: `cal-${crypto.randomUUID()}` })}>
            Generate
          </button>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-micro text-faint">
          {!configured
            ? 'Not configured — local only.'
            : status.error
              ? `Sync error: ${status.error}`
              : status.lastSyncAt
                ? `Synced ${new Date(status.lastSyncAt).toLocaleTimeString()}${status.pendingPush ? ' · pushing' : ''}`
                : 'Configured — waiting for the first sync.'}
        </span>
        {configured && (
          <button
            className="btn btn-sm"
            disabled={syncing}
            onClick={async () => {
              setSyncing(true)
              try {
                await syncNow()
              } finally {
                setSyncing(false)
              }
            }}
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        )}
      </div>
    </Section>
  )
}

function IntegrationsPanel() {
  const s = useStore()
  const hevyRef = useRef<HTMLInputElement>(null)
  const golfRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const [syncing, setSyncing] = useState(false)

  return (
    <Section label="Integrations">
      <div className="mb-6">
        <Eyebrow className="mb-2">Hevy — live sync</Eyebrow>
        <p className="mb-3 max-w-2xl text-micro leading-relaxed text-faint">
          In Hevy: Settings → Developer → generate an API key. Workouts pull straight in and count toward the week.
        </p>
        <div className="flex gap-2">
          <input className="field num min-w-0 flex-1" type="password" placeholder="Hevy API key" value={s.settings.hevyKey} onChange={(e) => s.setSettings({ hevyKey: e.target.value.trim() })} aria-label="Hevy key" />
          <button
            className="btn"
            disabled={syncing}
            onClick={async () => {
              if (!s.settings.hevyKey) return setMsg('Paste the Hevy API key first.')
              setSyncing(true)
              setMsg('')
              try {
                const { fetchHevyWorkouts } = await import('../lib/imports')
                const sessions = await fetchHevyWorkouts(s.settings.hevyKey)
                s.setHevySessions(sessions)
                setMsg(`Synced ${sessions.length} workouts.`)
              } catch (e) {
                setMsg(`${e instanceof Error ? e.message : 'Sync failed'} — the CSV import below always works.`)
              } finally {
                setSyncing(false)
              }
            }}
          >
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
        </div>
      </div>

      <Eyebrow className="mb-2">CSV imports</Eyebrow>
      <div className="flex flex-wrap gap-2">
        <button className="btn" onClick={() => hevyRef.current?.click()}>
          Hevy CSV {s.hevySessions.length > 0 && <span className="num text-faint">{s.hevySessions.length}</span>}
        </button>
        <button className="btn" onClick={() => golfRef.current?.click()}>
          Golfshot CSV {s.golfRounds.length > 0 && <span className="num text-faint">{s.golfRounds.length}</span>}
        </button>
        <input
          ref={hevyRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const { parseHevyCSV } = await import('../lib/imports')
            const sessions = parseHevyCSV(await file.text())
            if (!sessions.length) return setMsg('No workouts found in that file.')
            s.setHevySessions(sessions)
            setMsg(`Imported ${sessions.length} Hevy workouts.`)
          }}
        />
        <input
          ref={golfRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const { parseGolfshotCSV } = await import('../lib/imports')
            const rounds = parseGolfshotCSV(await file.text())
            if (!rounds.length) return setMsg('No rounds found in that file.')
            s.setGolfRounds(rounds)
            const avg = Math.round(rounds.slice(0, 20).reduce((a, r) => a + r.score, 0) / Math.min(rounds.length, 20))
            s.setGolfStats({ avgScore: avg })
            setMsg(`Imported ${rounds.length} rounds. Average updated to ${avg}.`)
          }}
        />
      </div>
      {msg && <p className="mt-4 text-micro text-mute">{msg}</p>}
    </Section>
  )
}

function VoicePanel() {
  const s = useStore()
  const [voices, setVoices] = useState(() => englishVoices())
  useEffect(() => {
    const refresh = () => setVoices(englishVoices())
    refresh()
    if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = refresh
    return () => {
      if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = null
    }
  }, [])

  return (
    <Section label="Voice">
      <div className="flex items-center justify-between border-b border-line py-3">
        <span className="text-body text-mute">Speak replies aloud</span>
        <Toggle on={s.settings.speakReplies} onChange={(v) => s.setSettings({ speakReplies: v })} label="Speak replies" />
      </div>
      {voices.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-b border-line py-3">
          <span className="text-body text-mute">Browser voice</span>
          <div className="flex gap-2">
            <select className="field max-w-[16rem]" value={s.settings.voiceURI} onChange={(e) => s.setSettings({ voiceURI: e.target.value })} aria-label="Voice">
              <option value="">Auto — best British male</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
            <button className="btn btn-sm" onClick={() => speak('Good evening, sir. All systems calibrated and standing by.', s.settings.voiceURI)}>
              Test
            </button>
          </div>
        </div>
      )}
      <div className="py-4">
        <Eyebrow className="mb-2">ElevenLabs — the cinematic voice</Eyebrow>
        <div className="flex gap-2">
          <input className="field num min-w-0 flex-1" type="password" placeholder="ElevenLabs API key (optional)" value={s.settings.elevenKey} onChange={(e) => s.setSettings({ elevenKey: e.target.value.trim() })} aria-label="ElevenLabs key" />
          <button
            className="btn"
            onClick={() =>
              speak(
                'Good evening, sir. All systems calibrated and standing by.',
                s.settings.voiceURI,
                s.settings.elevenKey ? { key: s.settings.elevenKey, voiceId: s.settings.elevenVoiceId } : undefined,
                s.settings.openaiKey,
              )
            }
          >
            Test
          </button>
        </div>
      </div>
      <div className="border-t border-line py-4">
        <Eyebrow className="mb-2">OpenAI — fallback voice, and iPhone dictation</Eyebrow>
        <input className="field num w-full" type="password" placeholder="OpenAI API key (optional)" value={s.settings.openaiKey ?? ''} onChange={(e) => s.setSettings({ openaiKey: e.target.value.trim() })} aria-label="OpenAI key" />
      </div>
    </Section>
  )
}

const PROVIDERS: { id: LlmProvider; label: string; note: string }[] = [
  { id: 'none', label: 'Built-in only', note: 'Instant logging and edits. No reasoning, no cost, no key.' },
  { id: 'anthropic', label: 'Claude', note: 'Best judgement and the most reliable tool use. Cents per conversation.' },
  { id: 'gemini', label: 'Gemini', note: "Google's free tier — a generous daily quota at no cost. Reads photos." },
  { id: 'groq', label: 'Groq', note: 'Genuinely free, no card, extremely fast. No vision.' },
  { id: 'openrouter', label: 'OpenRouter', note: 'One key, many free models. The default reads photos.' },
  { id: 'local', label: 'On-device', note: 'Ollama or LM Studio on this Mac. Private and free — but weaker at tools, and invisible to your phone.' },
]

export function Settings({ label }: { label: string }) {
  const s = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const p = s.settings.provider

  const keyField = (
    provider: LlmProvider,
    keyProp: 'anthropicKey' | 'geminiKey' | 'groqKey' | 'openrouterKey',
    modelProp: 'anthropicModel' | 'geminiModel' | 'groqModel' | 'openrouterModel',
    placeholder: string,
  ) => (
    <div className="space-y-2">
      <input
        className="field num w-full"
        type="password"
        placeholder={placeholder}
        value={s.settings[keyProp]}
        onChange={(e) => s.setSettings({ [keyProp]: e.target.value.trim() } as never)}
        aria-label="API key"
      />
      <input
        className="field num w-full"
        placeholder="Model"
        value={s.settings[modelProp]}
        onChange={(e) => s.setSettings({ [modelProp]: e.target.value.trim() } as never)}
        aria-label="Model"
      />
      <TestButton provider={provider} />
    </div>
  )

  return (
    <Page title={label} lede="Keys, memory, navigation and reminders. Everything is stored on this device unless you turn on sync.">
      <SettingsIndex />

      <div id="set-brand">
        <BrandSection />
      </div>

      <div id="set-navigation">
        <NavigationPanel />
      </div>

      <Section label="Jarvis — the brain" id="set-jarvis">
        <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PROVIDERS.map((pr) => (
            <button
              key={pr.id}
              onClick={() => s.setSettings({ provider: pr.id })}
              className={`border p-4 text-left transition-colors ${p === pr.id ? 'border-paper' : 'border-line hover:border-line-2'}`}
            >
              <div className={`text-body ${p === pr.id ? 'text-paper' : 'text-mute'}`}>{pr.label}</div>
              <div className="mt-1.5 text-micro leading-relaxed text-faint">{pr.note}</div>
            </button>
          ))}
        </div>

        {p === 'anthropic' && keyField('anthropic', 'anthropicKey', 'anthropicModel', 'sk-ant-… (console.anthropic.com)')}
        {p === 'gemini' && keyField('gemini', 'geminiKey', 'geminiModel', 'AI… (aistudio.google.com — free)')}
        {p === 'groq' && keyField('groq', 'groqKey', 'groqModel', 'gsk_… (console.groq.com — free, no card)')}
        {p === 'openrouter' && keyField('openrouter', 'openrouterKey', 'openrouterModel', 'sk-or-… (openrouter.ai/keys)')}
        {p === 'local' && (
          <div className="space-y-2">
            <p className="max-w-2xl text-micro leading-relaxed text-faint">
              Point this at an OpenAI-compatible server on this machine. Ollama runs one at{' '}
              <span className="num text-mute">http://127.0.0.1:11434/v1</span>, LM Studio at{' '}
              <span className="num text-mute">http://127.0.0.1:1234/v1</span>. Two things to know: the browser must be
              allowed to call it — for Ollama that means launching it with{' '}
              <span className="num text-mute">OLLAMA_ORIGINS="*"</span> — and your phone cannot reach this Mac's
              localhost, so on-device only works on the desktop.
            </p>
            <input
              className="field num w-full"
              placeholder="http://127.0.0.1:11434/v1"
              value={s.settings.localBaseUrl}
              onChange={(e) => s.setSettings({ localBaseUrl: e.target.value.trim() })}
              aria-label="Local server URL"
            />
            <input
              className="field num w-full"
              placeholder="Model — e.g. qwen3:8b"
              value={s.settings.localModel}
              onChange={(e) => s.setSettings({ localModel: e.target.value.trim() })}
              aria-label="Local model"
            />
            <TestButton provider="local" />
          </div>
        )}

        <div className="mt-6 space-y-1 border-t border-line pt-5">
          <div className="flex items-center justify-between border-b border-line py-3">
            <div className="max-w-lg">
              <div className="text-body text-mute">Live web search</div>
              <p className="mt-1 text-micro leading-relaxed text-faint">
                Works on every provider — news, prices and specs come back sourced, and Jarvis is told to say it found
                nothing rather than invent a number.
              </p>
            </div>
            <Toggle on={s.settings.webSearch} onChange={(v) => s.setSettings({ webSearch: v })} label="Web search" />
          </div>
          <div className="flex items-center justify-between border-b border-line py-3">
            <div className="max-w-lg">
              <div className="text-body text-mute">Tool steps per message</div>
              <p className="mt-1 text-micro leading-relaxed text-faint">
                How many read → act → observe rounds Jarvis may take before it must answer. Higher finishes bigger
                restructures unaided; lower is cheaper and faster.
              </p>
            </div>
            <NumCell value={s.settings.agentSteps} onChange={(v) => s.setSettings({ agentSteps: Math.max(1, Math.min(12, v ?? 6)) })} ariaLabel="Agent steps" width="w-10" />
          </div>
          <div className="flex items-center justify-between py-3">
            <span className="text-body text-mute">Automatic failover</span>
            <span className="text-micro text-faint">Claude → Gemini → Groq → OpenRouter → on-device</span>
          </div>
        </div>
      </Section>

      <div id="set-consistency">
        <ConsistencyPanel />
      </div>
      <div id="set-memory">
        <MemoryPanel />
      </div>
      <div id="set-github">
        <GithubSyncPanel />
      </div>
      <div id="set-voice">
        <VoicePanel />
      </div>
      <div id="set-sync">
        <SyncPanel />
      </div>
      <div id="set-integrations">
        <IntegrationsPanel />
      </div>

      <Section label="Data sources" id="set-sources">
        <label className="block border-b border-line py-3">
          <Eyebrow className="mb-2">USDA FoodData Central — generic food macros (free key at fdc.nal.usda.gov)</Eyebrow>
          <input className="field num w-full" type="password" placeholder="Optional — falls back to DEMO_KEY, which throttles" value={s.settings.usdaKey} onChange={(e) => s.setSettings({ usdaKey: e.target.value.trim() })} aria-label="USDA key" />
          <p className="mt-2 text-micro leading-relaxed text-faint">
            Branded and European products come from Open Food Facts, which needs no key at all.
          </p>
        </label>
        <label className="block border-b border-line py-3">
          <Eyebrow className="mb-2">Finnhub — stock quotes and the market wire (free at finnhub.io)</Eyebrow>
          <input className="field num w-full" type="password" placeholder="Optional" value={s.settings.finnhubKey} onChange={(e) => s.setSettings({ finnhubKey: e.target.value.trim() })} aria-label="Finnhub key" />
        </label>
        <label className="block py-3">
          <Eyebrow className="mb-2">GNews — optional upgrade for the news wire (it works without a key)</Eyebrow>
          <input className="field num w-full" type="password" placeholder="Optional — the wire runs keyless by default" value={s.settings.gnewsKey} onChange={(e) => s.setSettings({ gnewsKey: e.target.value.trim() })} aria-label="GNews key" />
        </label>
      </Section>

      <Section label="Data" id="set-data">
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => void downloadBackup()}>
            Export backup
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = () => {
                try {
                  const parsed: unknown = JSON.parse(String(reader.result))
                  if (!isCalibrateBackup(parsed)) throw new Error('bad shape')
                  void restoreBackup(parsed) // reloads on success
                } catch {
                  alert('That is not a valid Calibrate backup.')
                }
              }
              reader.readAsText(file)
            }}
          />
          <DangerBtn onConfirm={s.resetAll} label="Factory reset" glyph="refresh" />
        </div>
        <p className="mt-4 max-w-2xl text-micro leading-relaxed text-faint">
          Data lives in this browser unless sync is configured. The export carries your photo blobs too, not just the
          text — take one before clearing site data, and import it on another device to move everything across.
        </p>
      </Section>
    </Page>
  )
}
