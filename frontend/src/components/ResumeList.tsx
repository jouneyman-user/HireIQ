type Resume = {
  id: number
  candidate_name: string
  candidate_email: string
  original_filename: string
  file_size_bytes: number
  uploaded_at: string
}

export function ResumeList({ resumes }: { resumes: Resume[] }) {
  if (resumes.length === 0) return <p>No resumes uploaded yet.</p>
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 24 }}>
      <thead>
        <tr>
          {['Name', 'Email', 'File', 'Size', 'Uploaded'].map((h) => (
            <th
              key={h}
              style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '6px 8px' }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {resumes.map((r) => (
          <tr key={r.id}>
            <td style={{ padding: '6px 8px' }}>{r.candidate_name}</td>
            <td style={{ padding: '6px 8px' }}>{r.candidate_email}</td>
            <td style={{ padding: '6px 8px' }}>{r.original_filename}</td>
            <td style={{ padding: '6px 8px' }}>{(r.file_size_bytes / 1024).toFixed(1)} KB</td>
            <td style={{ padding: '6px 8px' }}>{new Date(r.uploaded_at).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
