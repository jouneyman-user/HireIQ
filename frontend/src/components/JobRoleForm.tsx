import { useState, KeyboardEvent } from 'react'

export type JobRoleData = {
  jobTitle: string
  seniorityLevel: string
  keySkills: string[]
}

const SENIORITY_OPTIONS = ['Junior', 'Mid-Level', 'Senior', 'Lead', 'Principal']

type Props = {
  onSubmit: (data: JobRoleData) => void
  disabled?: boolean
}

export function JobRoleForm({ onSubmit, disabled = false }: Props) {
  const [jobTitle, setJobTitle] = useState('')
  const [seniorityLevel, setSeniority] = useState('')
  const [keySkills, setKeySkills] = useState<string[]>([])
  const [skillInput, setSkillInput] = useState('')
  const [errors, setErrors] = useState<Partial<Record<keyof JobRoleData, string>>>({})

  const addSkill = () => {
    const trimmed = skillInput.trim()
    if (!trimmed || keySkills.includes(trimmed)) return
    setKeySkills((prev) => [...prev, trimmed])
    setSkillInput('')
  }

  const removeSkill = (skill: string) => {
    setKeySkills((prev) => prev.filter((s) => s !== skill))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addSkill()
    }
  }

  const validate = (): boolean => {
    const errs: Partial<Record<keyof JobRoleData, string>> = {}
    if (!jobTitle.trim()) errs.jobTitle = 'Job title is required.'
    if (!seniorityLevel) errs.seniorityLevel = 'Seniority level is required.'
    if (keySkills.length === 0) errs.keySkills = 'At least one key skill is required.'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    onSubmit({ jobTitle: jobTitle.trim(), seniorityLevel, keySkills })
  }

  const handleClear = () => {
    setJobTitle('')
    setSeniority('')
    setKeySkills([])
    setSkillInput('')
    setErrors({})
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
      <h2>Job Role</h2>

      {/* Job Title */}
      <label htmlFor="job-title">Job Title *</label>
      <input
        id="job-title"
        type="text"
        value={jobTitle}
        onChange={(e) => setJobTitle(e.target.value)}
        placeholder="e.g. Frontend Engineer"
        disabled={disabled}
        style={{ display: 'block', width: '100%', marginBottom: 4 }}
      />
      {errors.jobTitle && (
        <p style={{ color: 'red', margin: '0 0 8px' }}>{errors.jobTitle}</p>
      )}

      {/* Seniority Level */}
      <label htmlFor="seniority-level">Seniority Level *</label>
      <select
        id="seniority-level"
        value={seniorityLevel}
        onChange={(e) => setSeniority(e.target.value)}
        disabled={disabled}
        style={{ display: 'block', width: '100%', marginBottom: 4 }}
      >
        <option value="">Select seniority…</option>
        {SENIORITY_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      {errors.seniorityLevel && (
        <p style={{ color: 'red', margin: '0 0 8px' }}>{errors.seniorityLevel}</p>
      )}

      {/* Key Skills Tag Input */}
      <label htmlFor="skill-input">Key Skills * (press Enter to add)</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        <input
          id="skill-input"
          type="text"
          value={skillInput}
          onChange={(e) => setSkillInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. TypeScript"
          disabled={disabled}
          style={{ flex: 1 }}
        />
        <button
          type="button"
          onClick={addSkill}
          disabled={disabled || !skillInput.trim()}
        >
          Add
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
        {keySkills.map((skill) => (
          <span
            key={skill}
            style={{ background: '#e0e7ff', borderRadius: 4, padding: '2px 8px' }}
          >
            {skill}
            <button
              type="button"
              onClick={() => removeSkill(skill)}
              disabled={disabled}
              aria-label={`Remove ${skill}`}
              style={{ marginLeft: 4, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      {errors.keySkills && (
        <p style={{ color: 'red', margin: '0 0 8px' }}>{errors.keySkills}</p>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="submit" disabled={disabled}>
          Generate Questions
        </button>
        <button type="button" onClick={handleClear} disabled={disabled}>
          Clear
        </button>
      </div>
    </form>
  )
}
