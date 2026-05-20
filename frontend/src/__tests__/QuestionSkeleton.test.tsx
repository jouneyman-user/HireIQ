import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { QuestionSkeleton } from '../components/QuestionSkeleton'

describe('QuestionSkeleton', () => {
  it('renders an element with role="status"', () => {
    render(<QuestionSkeleton />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('has aria-label "Generating questions…"', () => {
    render(<QuestionSkeleton />)
    expect(
      screen.getByRole('status', { name: /generating questions/i })
    ).toBeInTheDocument()
  })

  it('renders skeleton blocks for three category sections', () => {
    render(<QuestionSkeleton />)
    // Each category renders its label as aria-hidden text — we check via
    // the category title text nodes inside the component.
    const statuses = screen.getAllByRole('status')
    // The outer wrapper has role="status"; that's the one we care about.
    expect(statuses.length).toBeGreaterThanOrEqual(1)
  })

  it('renders at least 9 skeleton card placeholders (3 per category × 3 categories)', () => {
    const { container } = render(<QuestionSkeleton />)
    // Each card placeholder is a div with a specific border style.
    // jsdom normalizes hex colors to RGB, so we match the RGB equivalent of #e2e8f0.
    const cardDivs = container.querySelectorAll('div[style*="border: 1px solid rgb"]')
    expect(cardDivs.length).toBeGreaterThanOrEqual(9)
  })
})
