import { lazy, Suspense } from 'react'
import { Shell } from './components/Shell'
import { Dashboard } from './modules/Dashboard'
import { useStore } from './store/store'

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

/** Skeleton shown for the instant a module chunk is in flight (first visit only). */
function ModuleLoading() {
  return (
    <div className="space-y-4 px-1" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-48 animate-pulse rounded-lg bg-white/5" />
      <div className="h-36 animate-pulse rounded-2xl bg-white/5" />
      <div className="h-64 animate-pulse rounded-2xl bg-white/5" />
    </div>
  )
}

export default function App() {
  const view = useStore((s) => s.view)
  return (
    <>
      <div className="atmosphere" aria-hidden="true" />
      <Shell>
        <Suspense fallback={<ModuleLoading />}>
          {view === 'today' && <Dashboard />}
          {view === 'jarvis' && <Jarvis />}
          {view === 'goals' && <Goals />}
          {view === 'training' && <Training />}
          {view === 'golf' && <Golf />}
          {view === 'nutrition' && <Nutrition />}
          {view === 'recovery' && <Recovery />}
          {view === 'grocery' && <Grocery />}
          {view === 'notes' && <Notes />}
          {view === 'business' && <Business />}
          {view === 'books' && <Books />}
          {view === 'mindset' && <Mindset />}
          {view === 'markets' && <Markets />}
          {view === 'news' && <News />}
          {view === 'schedule' && <Schedule />}
          {view === 'review' && <Review />}
          {view === 'settings' && <Settings />}
        </Suspense>
      </Shell>
      {view !== 'jarvis' && (
        <Suspense fallback={null}>
          <JarvisDock />
        </Suspense>
      )}
    </>
  )
}
