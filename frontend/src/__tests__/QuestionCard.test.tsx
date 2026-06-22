import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QuestionCard } from '../components/QuestionCard'

const QUESTION = {
  text: 'Describe a time you optimised a slow query.',
  follow_up: 'What was the measurable impact?',
  what_to_listen_for: 'Candidate should mention EXPLAIN ANALYSE and indexing strategies.',
}

// Mock navigator.clipboard before each test.
const writeTextMock = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'clipboard', {
    writable: true,
    configurable: true,
    value: { writeText: writeTextMock },
  })
})

describe('QuestionCard', () => {
  it('renders the main question text', () => {
    render(<QuestionCard question={QUESTION} index={0} />)
    expect(
      screen.getByText(/Describe a time you optimised a slow query/i)
    ).toBeInTheDocument()
  })

  it('renders a 1-based index prefix before the question', () => {
    render(<QuestionCard question={QUESTION} index={2} />)
    // index 2 → displayed as "3."
    expect(screen.getByText(/3\./)).toBeInTheDocument()
  })

  it('renders the follow-up text', () => {
    render(<QuestionCard question={QUESTION} index={0} />)
    expect(
      screen.getByText(/What was the measurable impact\?/i)
    ).toBeInTheDocument()
  })

  it('renders the evaluation tip text', () => {
    render(<QuestionCard question={QUESTION} index={0} />)
    expect(
      screen.getByText(/EXPLAIN ANALYSE and indexing strategies/i)
    ).toBeInTheDocument()
  })

  it('renders a copy button with aria-label "Copy question"', () => {
    render(<QuestionCard question={QUESTION} index={0} />)
    expect(screen.getByRole('button', { name: /copy question/i })).toBeInTheDocument()
  })

  it('calls clipboard.writeText with formatted content when copy button is clicked', async () => {
    render(<QuestionCard question={QUESTION} index={0} />)
    fireEvent.click(screen.getByRole('button', { name: /copy question/i }))
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledTimes(1)
    })
    const written: string = writeTextMock.mock.calls[0][0]
    expect(written).toContain('Q1:')
    expect(written).toContain(QUESTION.text)
    expect(written).toContain('Follow-up:')
    expect(written).toContain(QUESTION.follow_up)
    expect(written).toContain('Tip:')
    expect(written).toContain(QUESTION.what_to_listen_for)
  })

  it('shows "✓ Copied" feedback immediately after clicking copy', async () => {
    render(<QuestionCard question={QUESTION} index={0} />)
    fireEvent.click(screen.getByRole('button', { name: /copy question/i }))
    await waitFor(() => {
      expect(screen.getByText(/✓ Copied/i)).toBeInTheDocument()
    })
  })
})
