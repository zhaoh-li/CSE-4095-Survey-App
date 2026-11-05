import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// After a new deployment, a tab opened earlier may ask for code files that no
// longer exist. Reload once to get the new version (D28); the
// "This site was updated." screen shows meanwhile. If it fails again within
// 10 seconds, the screen stays, so a real outage can't cause a reload loop.
window.addEventListener('vite:preloadError', () => {
  const key = 'classroom-survey:reloaded-at'
  try {
    if (Date.now() - Number(sessionStorage.getItem(key) ?? 0) < 10_000) return
    sessionStorage.setItem(key, String(Date.now()))
  } catch {
    return // sessionStorage blocked: don't risk a loop
  }
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
