import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import App from '../App'

const server = setupServer(
  http.get('/api/resumes/', () => {
    return HttpResponse.json([])
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
})
