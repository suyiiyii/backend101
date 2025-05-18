import React from 'react'
import 'tailwindcss/tailwind.css'
import ReactDOM from 'react-dom/client'
import Judger from './components/Judger'

const rootElement = document.getElementById('root')
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <React.StrictMode>
      <Judger />
    </React.StrictMode>
  )
} else {
  console.error('Failed to find the root element')
}
