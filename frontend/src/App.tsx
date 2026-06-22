import { useEffect, useState } from 'react'
import { ResumeList } from './components/ResumeList'
import { ResumeUpload } from './components/ResumeUpload'
import { JobRoleForm, JobRoleData } from './components/JobRoleForm'
import { QuestionDisplay } from './components/QuestionDisplay'
import { QuestionSkeleton } from './components/QuestionSkeleton'

type Resume = {
  id: number
  candidate_name: string
  candidate_email: string
  original_filename: string
  file_size_bytes: number
  uploaded_at: string
}

type Question = {
  text: string
  follow_up: string
  what_to_listen_for: string
}

type GenerateResult = {
  technical: Question[]
  behavioural: Question[]
  culture_fit: Question[]
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
      // Step 1: fetch extracted resume text from the backend
      const textRes = await fetch(`/api/resumes/${activeResumeId}/text`)
      const textData = await textRes.json()
      if (!textRes.ok) {
        throw new Error(textData.detail ?? 'Could not read resume text.')
      }

      // Step 2: generate interview questions
      const res = await fetch('/api/generate/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_text: textData.resume_text,
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
      {generating && <QuestionSkeleton />}
      {generateResult && !generating && <QuestionDisplay questions={generateResult} />}
      <h2>Uploaded Resumes</h2>
      <ResumeList resumes={resumes} />
    </div>
  )
}

export default App
