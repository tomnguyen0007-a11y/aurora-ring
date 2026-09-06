import '@fontsource-variable/geist/index.css'
import './theme.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initSync } from './lib/supabase'
import { migrateLegacyPhotoBlobs } from './store/store'

initSync()
// Move any pre-IndexedDB photo blobs out of localStorage (no-op once done)
void migrateLegacyPhotoBlobs()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA: cache the shell for offline use, and give reminders a service worker
// to post through — the only path iOS honours once the app is installed.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
