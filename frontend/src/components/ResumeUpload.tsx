// frontend/src/components/ResumeUpload.tsx
import { useState, useRef } from 'react'

const ACCEPTED_TYPES = ['application/pdf', 'text/plain']
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

interface UploadResult {
  id: number
  filename: string
  uploaded_at: string
  text_preview: string
}

export function ResumeUpload() {
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    setResult(null)

    if (!selected) {
      setFile(null)
      setError(null)
      return
    }

    if (!ACCEPTED_TYPES.includes(selected.type)) {
      setFile(null)
      setError('Only PDF or .txt files are accepted.')
      return
    }

    if (selected.size > MAX_BYTES) {
      setFile(null)
      setError('Please upload a file that is 5 MB or smaller.')
      return
    }

    setError(null)
    setFile(selected)
  }

  async function handleUpload() {
    if (!file) return

    setUploading(true)
    setError(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/candidates/resume', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setError(body.detail ?? `Upload failed with status ${response.status}.`)
        return
      }

      const data: UploadResult = await response.json()
      setResult(data)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <label htmlFor="resume-file-input">Resume file</label>
      <input
        id="resume-file-input"
        ref={inputRef}
        type="file"
        onChange={handleFileChange}
        aria-label="Resume file"
      />

      <button
        type="button"
        onClick={handleUpload}
        disabled={!file || uploading}
      >
        {uploading ? 'Uploading\u2026' : 'Upload'}
      </button>

      {error && (
        <div role="alert">
          {error}
        </div>
      )}

      {result && (
        <div>
          <p>Uploaded: <strong>{result.filename}</strong></p>
          {result.text_preview && <p>{result.text_preview}</p>}
        </div>
      )}
    </div>
  )
}
