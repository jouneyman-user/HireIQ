import { useEffect, useState } from 'react'
import { ResumeList } from './components/ResumeList'
import { ResumeUpload } from './components/ResumeUpload'
import { JobRoleForm, JobRoleData } from './components/JobRoleForm'

type Resume = {
  id: number
  candidate_name: string
  candidate_email: string
  original_filename: string
  file_size_bytes: number
  uploaded_at: string
}

type GenerateResult = {
  message: string
  resume_id: number
  job_title: string
  seniority_level: string
  key_skills: string[]
}

function App() {
  const [resumes, setResumes] = useState<Resume[]>([])
  const [activeResumeId, setActiveResumeId] = useState<number | null>(null)
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    fetch('/api/resumes/')
      .then((r) => r.json())
      .then(setResumes)
      .catch(console.error)
  }, [])

  const handleUploaded = (r: Resume) => {
    setResumes((prev) => [r, ...prev])
    setActiveResumeId(r.id)
  }

  const handleGenerate = async (roleData: JobRoleData) => {
    if (!activeResumeId) return
    setGenerating(true)
    setGenerateResult(null)
    setGenerateError(null)
    try {
      const res = await fetch('/api/generate/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_id: activeResumeId,
          job_title: roleData.jobTitle,
          seniority_level: roleData.seniorityLevel,
          key_skills: roleData.keySkills,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? `HTTP ${res.status}`)
      setGenerateResult(data as GenerateResult)
    } catch (err: unknown) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
      <h1>HireIQ</h1>
      <ResumeUpload onUploaded={handleUploaded} />
      <hr style={{ margin: '2rem 0' }} />
      <JobRoleForm onSubmit={handleGenerate} disabled={!activeResumeId || generating} />
      {!activeResumeId && (
        <p style={{ color: '#888', marginTop: 8 }}>
          Upload a resume to enable question generation.
        </p>
      )}
      {generateError && <p style={{ color: 'red' }}>{generateError}</p>}
      {generateResult && <p style={{ color: 'green' }}>{generateResult.message}</p>}
      <h2>Uploaded Resumes</h2>
      <ResumeList resumes={resumes} />
    </div>
  )
}

export default App
