import { useEffect, useState } from 'react'
import { ResumeUpload } from './components/ResumeUpload'

function App() {
  const [status, setStatus] = useState<string>('loading…')

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setStatus(d.status))
      .catch(() => setStatus('unreachable'))
  }, [])

  return (
    <div>
      <h1>HireIQ</h1>
      <p>API status: <strong>{status}</strong></p>
      <ResumeUpload />
    </div>
  )
}

export default App
