import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { registerWorker, isEnabled } from './services/pushService.js'

// Re-register the push worker on boot, but ONLY for a device that already
// subscribed. This asks for nothing and prompts for nothing — a browser drops a
// worker registration on its own schedule, and without this a shopkeeper who
// turned notifications on last week silently stops receiving them.
//
// Permission itself is only ever requested from a deliberate tap in Profile.
if ('serviceWorker' in navigator) {
  isEnabled().then((on) => { if (on) registerWorker(); }).catch(() => {});
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
