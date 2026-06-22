import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import App from '../App'

const MOCK_GENERATE_RESULT = {
  technical: [
    { text: 'Q-T1', follow_up: 'FU-T1', what_to_listen_for: 'W-T1' },
    { text: 'Q-T2', follow_up: 'FU-T2', what_to_listen_for: 'W-T2' },
    { text: 'Q-T3', follow_up: 'FU-T3', what_to_listen_for: 'W-T3' },
  ],
  behavioural: [
    { text: 'Q-B1', follow_up: 'FU-B1', what_to_listen_for: 'W-B1' },
    { text: 'Q-B2', follow_up: 'FU-B2', what_to_listen_for: 'W-B2' },
    { text: 'Q-B3', follow_up: 'FU-B3', what_to_listen_for: 'W-B3' },
  ],
  culture_fit: [
    { text: 'Q-C1', follow_up: 'FU-C1', what_to_listen_for: 'W-C1' },
    { text: 'Q-C2', follow_up: 'FU-C2', what_to_listen_for: 'W-C2' },
    { text: 'Q-C3', follow_up: 'FU-C3', what_to_listen_for: 'W-C3' },
  ],
}

const server = setupServer(
  http.get('/api/resumes/', () => {
    return HttpResponse.json([])
  }),
  http.get('/api/resumes/:id/text', () => {
    return HttpResponse.json({ resume_text: 'Alice has 5 years of Python experience.' })
  }),
  http.post('/api/generate/', () => {
    return HttpResponse.json(MOCK_GENERATE_RESULT, { status: 200 })
  })
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('App', () => {
  it('renders the HireIQ heading', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: /hireiq/i })).toBeInTheDocument()
  })

  it('renders the upload form', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 2, name: /upload resume/i })).toBeInTheDocument()
  })

  it('renders the uploaded resumes heading', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 2, name: /uploaded resumes/i })).toBeInTheDocument()
  })

  it('shows empty state when no resumes are returned', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText(/no resumes uploaded yet/i)).toBeInTheDocument()
    })
  })

  it('displays uploaded resumes fetched on mount', async () => {
    server.use(
      http.get('/api/resumes/', () => {
        return HttpResponse.json([
          {
            id: 1,
            candidate_name: 'Alice',
            candidate_email: 'alice@test.com',
            original_filename: 'alice_cv.pdf',
            file_size_bytes: 1024,
            uploaded_at: '2026-05-14T12:00:00',
          },
        ])
      })
    )
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument()
    })
  })

  it('renders the job role form heading', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 2, name: /job role/i })).toBeInTheDocument()
  })

  it('shows upload hint when no resume is active', () => {
    render(<App />)
    expect(
      screen.getByText(/upload a resume to enable question generation/i)
    ).toBeInTheDocument()
  })

  it('generate questions button is disabled when no resume is uploaded', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /generate questions/i })).toBeDisabled()
  })
})
