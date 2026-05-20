import { useState } from 'react'

export type Question = {
  text: string
  follow_up: string
  what_to_listen_for: string
}

type Props = {
  question: Question
  index: number
}

export function QuestionCard({ question, index }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const content = [
      `Q${index + 1}: ${question.text}`,
      `Follow-up: ${question.follow_up}`,
      `Tip: ${question.what_to_listen_for}`,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard not available (non-HTTPS or older browser) — fail silently
    }
  }

  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: '1rem',
        marginBottom: '0.75rem',
        background: '#fff',
        position: 'relative',
        wordBreak: 'break-word',
      }}
    >
      {/* Copy button */}
      <button
        onClick={handleCopy}
        aria-label="Copy question"
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          background: 'none',
          border: '1px solid #cbd5e1',
          borderRadius: 4,
          padding: '2px 8px',
          cursor: 'pointer',
          fontSize: 12,
          color: copied ? '#16a34a' : '#64748b',
        }}
      >
        {copied ? '✓ Copied' : '📋 Copy'}
      </button>

      {/* Main question */}
      <p style={{ fontWeight: 600, marginTop: 0, marginRight: 80 }}>
        {index + 1}. {question.text}
      </p>

      {/* Follow-up */}
      <div
        style={{
          background: '#f0f9ff',
          borderLeft: '3px solid #38bdf8',
          padding: '0.5rem 0.75rem',
          marginBottom: '0.5rem',
          borderRadius: '0 4px 4px 0',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#0369a1',
            textTransform: 'uppercase',
          }}
        >
          Follow-up
        </span>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: '#0c4a6e' }}>
          {question.follow_up}
        </p>
      </div>

      {/* Evaluation tip */}
      <div
        style={{
          background: '#fefce8',
          borderLeft: '3px solid #facc15',
          padding: '0.5rem 0.75rem',
          borderRadius: '0 4px 4px 0',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#854d0e',
            textTransform: 'uppercase',
          }}
        >
          Evaluation tip
        </span>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: '#713f12' }}>
          {question.what_to_listen_for}
        </p>
      </div>
    </div>
  )
}
