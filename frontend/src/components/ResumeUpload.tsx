import { useRef, useState } from 'react'

type Resume = {
  id: number
  candidate_name: string
  candidate_email: string
  original_filename: string
  content_type: string
  file_size_bytes: number
  uploaded_at: string
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error'

const ACCEPTED = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

export function ResumeUpload({ onUploaded }: { onUploaded: (r: Resume) => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [state, setState] = useState<UploadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    if (!ACCEPTED.includes(f.type)) {
      setError('Only PDF and DOCX files are accepted.')
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('File must be under 10 MB.')
      return
    }
    setError(null)
    setFile(f)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) handleFile(dropped)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !name || !email) return
    setState('uploading')
    try {
      const form = new FormData()
      form.append('candidate_name', name)
      form.append('candidate_email', email)
      form.append('file', file)
      const res = await fetch('/api/resumes/', { method: 'POST', body: form })
      if (!res.ok) {
        const body = await res.json()
        throw new Error((body as { detail?: string }).detail ?? `HTTP ${res.status}`)
      }
      const uploaded: Resume = await res.json()
      setState('success')
      onUploaded(uploaded)
      setName('')
      setEmail('')
      setFile(null)
      setTimeout(() => setState('idle'), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
      setState('error')
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
      <h2>Upload Resume</h2>
      <input
        placeholder="Candidate name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        style={{ display: 'block', width: '100%', marginBottom: 8 }}
      />
      <input
        type="email"
        placeholder="Candidate email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        style={{ display: 'block', width: '100%', marginBottom: 8 }}
      />
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? '#0070f3' : '#ccc'}`,
          borderRadius: 8,
          padding: 24,
          textAlign: 'center',
          cursor: 'pointer',
          marginBottom: 8,
        }}
      >
        {file ? file.name : 'Drop PDF or DOCX here, or click to browse'}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx"
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files?.[0]) handleFile(e.target.files[0])
          }}
        />
      </div>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {state === 'success' && <p style={{ color: 'green' }}>Resume uploaded successfully!</p>}
      <button
        type="submit"
        disabled={state === 'uploading' || !file || !name || !email}
      >
        {state === 'uploading' ? 'Uploading...' : 'Upload Resume'}
      </button>
    </form>
  )
}
