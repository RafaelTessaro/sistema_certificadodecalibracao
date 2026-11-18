import './estilo.css'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { iniciar } from './app/acoes.ts'

createRoot(document.getElementById('raiz')!).render(<App />)
void iniciar()
