import '@douyinfe/semi-ui/react19-adapter'
import { createRoot } from 'react-dom/client'
import { createElement } from 'react'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('app')).render(createElement(App))
