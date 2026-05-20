import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QuestionDisplay } from '../components/QuestionDisplay'

const writeTextMock = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'clipboard', {
    writable: true,
    configurable: true,
    value: { writeText: writeTextMock },
  })
})

const QUESTIONS = {
  technical: [
    { text: 'T1', follow_up: 'T1-FU', what_to_listen_for: 'T1-Tip' },
    { text: 'T2', follow_up: 'T2-FU', what_to_listen_for: 'T2-Tip' },
    { text: 'T3', follow_up: 'T3-FU', what_to_listen_for: 'T3-Tip' },
  ],
  behavioural: [
    { text: 'B1', follow_up: 'B1-FU', what_to_listen_for: 'B1-Tip' },
    { text: 'B2', follow_up: 'B2-FU', what_to_listen_for: 'B2-Tip' },
    { text: 'B3', follow_up: 'B3-FU', what_to_listen_for: 'B3-Tip' },
  ],
  culture_fit: [
    { text: 'C1', follow_up: 'C1-FU', what_to_listen_for: 'C1-Tip' },
    { text: 'C2', follow_up: 'C2-FU', what_to_listen_for: 'C2-Tip' },
    { text: 'C3', follow_up: 'C3-FU', what_to_listen_for: 'C3-Tip' },
  ],
}

describe('QuestionDisplay', () => {
  it('renders the "Generated Questions" heading', () => {
    render(<QuestionDisplay questions={QUESTIONS} />)
    expect(
      screen.getByRole('heading', { name: /generated questions/i })
    ).toBeInTheDocument()
  })

  it('renders all three category section headers', () => {
    render(<QuestionDisplay questions={QUESTIONS} />)
    expect(screen.getByText(/^Technical$/)).toBeInTheDocument()
    expect(screen.getByText(/^Behavioural$/)).toBeInTheDocument()
    expect(screen.getByText(/^Culture Fit$/)).toBeInTheDocument()
  })

  it('shows question count in each section header', () => {
    render(<QuestionDisplay questions={QUESTIONS} />)
    // Each section has 3 questions — check that "3 questions" appears 3 times
    const countLabels = screen.getAllByText(/3 questions/)
    expect(countLabels).toHaveLength(3)
  })

  it('renders all 9 question cards by default (all sections expanded)', () => {
    render(<QuestionDisplay questions={QUESTIONS} />)
    // Each card renders "{index + 1}. {text}" — use getAllByText to handle multiple matches
    expect(screen.getAllByText(/T1/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/B1/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/C1/).length).toBeGreaterThan(0)
  })

  it('collapses a section when its header button is clicked', () => {
    render(<QuestionDisplay questions={QUESTIONS} />)
    // Click "Technical" section header to collapse it
    const technicalHeader = screen.getByRole('button', { name: /technical/i })
    fireEvent.click(technicalHeader)
    // Technical questions (T1, T1-FU, T1-Tip) should no longer be visible
    expect(screen.queryAllByText(/T1/).length).toBe(0)
    // Other sections remain visible
    expect(screen.getAllByText(/B1/).length).toBeGreaterThan(0)
  })

  it('re-expands a section when its header is clicked again', () => {
    render(<QuestionDisplay questions={QUESTIONS} />)
    const technicalHeader = screen.getByRole('button', { name: /technical/i })
    fireEvent.click(technicalHeader) // collapse
    fireEvent.click(technicalHeader) // expand
    expect(screen.getAllByText(/T1/).length).toBeGreaterThan(0)
  })

  it('section header has aria-expanded=true when open', () => {
    render(<QuestionDisplay questions={QUESTIONS} />)
    const technicalHeader = screen.getByRole('button', { name: /technical/i })
    expect(technicalHeader).toHaveAttribute('aria-expanded', 'true')
  })

  it('section header has aria-expanded=false after collapsing', () => {
    render(<QuestionDisplay questions={QUESTIONS} />)
    const technicalHeader = screen.getByRole('button', { name: /technical/i })
    fireEvent.click(technicalHeader)
    expect(technicalHeader).toHaveAttribute('aria-expanded', 'false')
  })

  it('renders a "Copy all questions" button', () => {
    render(<QuestionDisplay questions={QUESTIONS} />)
    expect(
      screen.getByRole('button', { name: /copy all questions/i })
    ).toBeInTheDocument()
  })

  it('calls clipboard.writeText when "Copy all questions" is clicked', async () => {
    render(<QuestionDisplay questions={QUESTIONS} />)
    fireEvent.click(screen.getByRole('button', { name: /copy all questions/i }))
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledTimes(1)
    })
    const written: string = writeTextMock.mock.calls[0][0]
    // Should contain all three category headers
    expect(written).toContain('=== Technical ===')
    expect(written).toContain('=== Behavioural ===')
    expect(written).toContain('=== Culture Fit ===')
    // Should contain question text from each category
    expect(written).toContain('T1')
    expect(written).toContain('B1')
    expect(written).toContain('C1')
  })

  it('renders an empty section gracefully when a category has 0 questions', () => {
    const sparse = { ...QUESTIONS, technical: [] }
    // Should not throw
    expect(() => render(<QuestionDisplay questions={sparse} />)).not.toThrow()
    // "0 questions" label appears for Technical
    expect(screen.getByText(/0 questions/)).toBeInTheDocument()
  })
})
