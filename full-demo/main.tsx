import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import './styles.css'

const rootElement: HTMLElement = document.getElementById('root')!
createRoot(rootElement).render(<App />)
