import { lazy, Suspense, useEffect } from 'react'
import { Shell } from './components/Shell'
import { applyFavicon } from './lib/brand'
import { startReminderLoop, updateBadge } from './lib/notify'
import { Custom } from './modules/Custom'
import { Dashboard } from './modules/Dashboard'
import { useStore } from './store/store'
import type { SectionDef } from './store/types'

// Dashboard (the wake-up view) and the shell ship in the main bundle; every
// other module loads on first visit — a smaller initial download and faster
// first paint on mobile. The service worker caches each chunk after its first
// fetch, so anything visited once still works offline. JarvisDock must be lazy
// alongside Jarvis (it imports useJarvis from it) or the whole Jarvis module
// would ride along in the main bundle anyway.
const Jarvis = lazy(() => import('./modules/Jarvis').then((m) => ({ default: m.Jarvis })))
const JarvisDock = lazy(() => import('./modules/JarvisDock').then((m) => ({ default: m.JarvisDock })))
const Books = lazy(() => import('./modules/Books').then((m) => ({ default: m.Books })))
const Business = lazy(() => import('./modules/Business').then((m) => ({ default: m.Business })))
const Goals = lazy(() => import('./modules/Goals').then((m) => ({ default: m.Goals })))
const Golf = lazy(() => import('./modules/Golf').then((m) => ({ default: m.Golf })))
const Grocery = lazy(() => import('./modules/Grocery').then((m) => ({ default: m.Grocery })))
const Markets = lazy(() => import('./modules/Markets').then((m) => ({ default: m.Markets })))
const Mindset = lazy(() => import('./modules/Mindset').then((m) => ({ default: m.Mindset })))
const News = lazy(() => import('./modules/News').then((m) => ({ default: m.News })))
const Notes = lazy(() => import('./modules/Notes').then((m) => ({ default: m.Notes })))
const Nutrition = lazy(() => import('./modules/Nutrition').then((m) => ({ default: m.Nutrition })))
const Recovery = lazy(() => import('./modules/Recovery').then((m) => ({ default: m.Recovery })))
const Review = lazy(() => import('./modules/Review').then((m) => ({ default: m.Review })))
const Schedule = lazy(() => import('./modules/Schedule').then((m) => ({ default: m.Schedule })))
const Settings = lazy(() => import('./modules/Settings').then((m) => ({ default: m.Settings })))
const Training = lazy(() => import('./modules/Training').then((m) => ({ default: m.Training })))

/** Hairline skeleton for the instant a module chunk is in flight (first visit only). */
function ModuleLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-56 animate-breathe bg-ink-2" />
      <div className="h-px bg-line" />
      <div className="h-40 animate-breathe bg-ink-2" />
      <div className="h-64 animate-breathe bg-ink-2" />
    </div>
  )
}

/**
 * Sections are data, so routing is a lookup rather than a switch on hard-coded
 * view names. A section carries the module that renders it and the label it
 * renders under — rename it and the page heading follows.
 */
function Render({ section }: { section: SectionDef }) {
  const label = section.label
  switch (section.module) {
    case 'dashboard':
      return <Dashboard />
    case 'jarvis':
      return <Jarvis label={label} />
    case 'goals':
      return <Goals label={label} />
    case 'training':
      return <Training label={label} />
    case 'golf':
      return <Golf label={label} />
    case 'nutrition':
      return <Nutrition label={label} />
    case 'recovery':
      return <Recovery label={label} />
    case 'grocery':
      return <Grocery label={label} />
    case 'notes':
      return <Notes label={label} />
    case 'business':
      return <Business label={label} />
    case 'books':
      return <Books label={label} />
    case 'mindset':
      return <Mindset label={label} />
    case 'markets':
      return <Markets label={label} />
    case 'news':
      return <News label={label} />
    case 'schedule':
      return <Schedule label={label} />
    case 'review':
      return <Review label={label} />
    case 'settings':
      return <Settings label={label} />
    default:
      return <Custom section={section} />
  }
}

export default function App() {
  const view = useStore((s) => s.view)
  const sections = useStore((s) => s.sections)
  const brandMark = useStore((s) => s.settings.brandMark)
  const brandInvert = useStore((s) => s.settings.brandInvert)
  const brandName = useStore((s) => s.settings.brandName)

  const section = sections.find((x) => x.id === view) ?? sections.find((x) => !x.hidden) ?? sections[0]

  useEffect(() => {
    const stop = startReminderLoop()
    updateBadge()
    return stop
  }, [])

  // Your mark owns the browser tab too, not just the sidebar.
  useEffect(() => {
    applyFavicon(brandMark, !!brandInvert)
  }, [brandMark, brandInvert])

  useEffect(() => {
    document.title = `${brandName || 'Calibrate'}${section ? ` · ${section.label}` : ''}`
  }, [brandName, section])

  return (
    <Shell
      footer={
        section?.module !== 'jarvis' ? (
          <Suspense fallback={null}>
            <JarvisDock />
          </Suspense>
        ) : null
      }
    >
      <Suspense fallback={<ModuleLoading />}>{section ? <Render section={section} /> : null}</Suspense>
    </Shell>
  )
}
