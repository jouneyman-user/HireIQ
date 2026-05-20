import { useState } from 'react'
import { QuestionCard, Question } from './QuestionCard'

type QuestionSet = {
  technical: Question[]
  behavioural: Question[]
  culture_fit: Question[]
}

type Props = {
  questions: QuestionSet
}

type CategoryKey = keyof QuestionSet

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  technical: 'Technical',
  behavioural: 'Behavioural',
  culture_fit: 'Culture Fit',
}

const CATEGORY_COLOURS: Record<CategoryKey, string> = {
  technical: '#6366f1',
  behavioural: '#0891b2',
  culture_fit: '#16a34a',
}

const CATEGORY_ORDER: CategoryKey[] = ['technical', 'behavioural', 'culture_fit']

function buildAllText(questions: QuestionSet): string {
  return CATEGORY_ORDER.map((key) => {
    const label = CATEGORY_LABELS[key]
    const section = questions[key]
      .map(
        (q, i) =>
          `${i + 1}. ${q.text}\n   Follow-up: ${q.follow_up}\n   Tip: ${q.what_to_listen_for}`
      )
      .join('\n\n')
    return `=== ${label} ===\n${section}`
  }).join('\n\n')
}

export function QuestionDisplay({ questions }: Props) {
  const [openSections, setOpenSections] = useState<Record<CategoryKey, boolean>>({
    technical: true,
    behavioural: true,
    culture_fit: true,
  })
  const [allCopied, setAllCopied] = useState(false)

  const toggleSection = (key: CategoryKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(buildAllText(questions))
      setAllCopied(true)
      setTimeout(() => setAllCopied(false), 2000)
    } catch {
      // clipboard unavailable — fail silently
    }
  }

  return (
    <div style={{ marginTop: '2rem' }}>
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <h2 style={{ margin: 0 }}>Generated Questions</h2>
        <button
          onClick={handleCopyAll}
          aria-label="Copy all questions"
          style={{
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            padding: '6px 14px',
            background: allCopied ? '#dcfce7' : '#f8fafc',
            cursor: 'pointer',
            fontSize: 13,
            color: allCopied ? '#16a34a' : '#334155',
          }}
        >
          {allCopied ? '✓ All copied!' : '📋 Copy all questions'}
        </button>
      </div>

      {/* Category sections */}
      {CATEGORY_ORDER.map((key) => {
        const colour = CATEGORY_COLOURS[key]
        const label = CATEGORY_LABELS[key]
        const isOpen = openSections[key]
        const qs = questions[key]

        return (
          <div key={key} style={{ marginBottom: '1.5rem' }}>
            {/* Collapsible header */}
            <button
              onClick={() => toggleSection(key)}
              aria-expanded={isOpen}
              style={{
                width: '100%',
                textAlign: 'left',
                background: colour,
                color: '#fff',
                border: 'none',
                borderRadius: isOpen ? '8px 8px 0 0' : 8,
                padding: '0.75rem 1rem',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontWeight: 700,
                fontSize: 15,
              }}
            >
              <span>{label}</span>
              <span style={{ fontSize: 12, opacity: 0.85 }}>
                {qs.length} question{qs.length !== 1 ? 's' : ''} {isOpen ? '▲' : '▼'}
              </span>
            </button>

            {isOpen && (
              <div
                style={{
                  border: `1px solid ${colour}`,
                  borderTop: 'none',
                  borderRadius: '0 0 8px 8px',
                  padding: '1rem',
                  background: '#fafafa',
                }}
              >
                {qs.map((q, i) => (
                  <QuestionCard key={i} question={q} index={i} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
