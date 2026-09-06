import { useEffect } from 'react'
import { Shell } from './components/Shell'
import { Books } from './modules/Books'
import { Business } from './modules/Business'
import { Custom } from './modules/Custom'
import { Dashboard } from './modules/Dashboard'
import { Goals } from './modules/Goals'
import { Golf } from './modules/Golf'
import { Grocery } from './modules/Grocery'
import { Jarvis } from './modules/Jarvis'
import { JarvisDock } from './modules/JarvisDock'
import { Markets } from './modules/Markets'
import { Mindset } from './modules/Mindset'
import { News } from './modules/News'
import { Notes } from './modules/Notes'
import { Nutrition } from './modules/Nutrition'
import { Recovery } from './modules/Recovery'
import { Review } from './modules/Review'
import { Schedule } from './modules/Schedule'
import { Settings } from './modules/Settings'
import { Training } from './modules/Training'
import { useJarvis } from './modules/useJarvis'
import { applyFavicon } from './lib/brand'
import { startReminderLoop, updateBadge } from './lib/notify'
import { useStore } from './store/store'
import type { SectionDef } from './store/types'

/**
 * Sections are data, so routing is a lookup rather than a switch on
 * hard-coded view names. A section carries the module that renders it and
 * the label it renders under — rename it and the page heading follows.
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
  const { send } = useJarvis()

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
    <>
      <Shell onAsk={(t) => void send(t)}>{section ? <Render section={section} /> : null}</Shell>
      {section?.module !== 'jarvis' && <JarvisDock />}
    </>
  )
}
