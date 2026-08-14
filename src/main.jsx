import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.jsx'
import AthenaAccess from './AthenaAccess.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AthenaAccess>
      {(access) => <App {...access} />}
    </AthenaAccess>
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {})
  })
}
