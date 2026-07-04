import { Shell } from './components/Shell'
import { JarvisDock } from './modules/JarvisDock'
import { Books } from './modules/Books'
import { Business } from './modules/Business'
import { Dashboard } from './modules/Dashboard'
import { Goals } from './modules/Goals'
import { Golf } from './modules/Golf'
import { Grocery } from './modules/Grocery'
import { Jarvis } from './modules/Jarvis'
import { Markets } from './modules/Markets'
import { Mindset } from './modules/Mindset'
import { Notes } from './modules/Notes'
import { Nutrition } from './modules/Nutrition'
import { Recovery } from './modules/Recovery'
import { Schedule } from './modules/Schedule'
import { Settings } from './modules/Settings'
import { Training } from './modules/Training'
import { useStore } from './store/store'

export default function App() {
  const view = useStore((s) => s.view)
  return (
    <>
      <div className="atmosphere" aria-hidden="true" />
      <Shell>
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
        {view === 'schedule' && <Schedule />}
        {view === 'settings' && <Settings />}
      </Shell>
      {view !== 'jarvis' && <JarvisDock />}
    </>
  )
}
