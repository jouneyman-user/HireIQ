import { useEffect, useState } from 'react'
import { ResumeList } from './components/ResumeList'
import { ResumeUpload } from './components/ResumeUpload'

type Resume = {
  id: number
  candidate_name: string
  candidate_email: string
  original_filename: string
  file_size_bytes: number
  uploaded_at: string
}

function App() {
  const [resumes, setResumes] = useState<Resume[]>([])

  useEffect(() => {
    fetch('/api/resumes/')
      .then((r) => r.json())
      .then(setResumes)
      .catch(console.error)
  }, [])

  const handleUploaded = (r: Resume) => setResumes((prev) => [r, ...prev])

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
      <h1>HireIQ</h1>
      <ResumeUpload onUploaded={handleUploaded} />
      <h2>Uploaded Resumes</h2>
      <ResumeList resumes={resumes} />
    </div>
  )
}

export default App
