import '@douyinfe/semi-ui/react19-adapter'
import { createRoot } from 'react-dom/client'
import { createElement } from 'react'
import App from './App.jsx'
import ShareApp from './ShareApp.jsx'
import './styles.css'

function isShareMode() {
  if (import.meta.env.VITE_IS_SHARE_ONLY === 'true') return true
  const pathname = window.location.pathname.replace(/\/$/, '')
  if (pathname.endsWith('/share')) return true
  const hash = window.location.hash || ''
  const search = window.location.search || ''
  if (hash.includes('token=') || search.includes('token=')) {
    return true
  }
  return false
}

const RootComponent = isShareMode() ? ShareApp : App

createRoot(document.getElementById('app')).render(createElement(RootComponent))
