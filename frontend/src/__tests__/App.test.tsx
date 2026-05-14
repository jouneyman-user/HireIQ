import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import App from '../App'

const server = setupServer(
  http.get('/api/health', () => {
    return HttpResponse.json({ status: 'ok', timestamp: '2026-05-14T12:00:00.000000+00:00' })
  })
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('App', () => {
  it('renders the HireIQ heading', () => {
    render(<App />)
    expect(screen.getByText('HireIQ')).toBeInTheDocument()
  })

  it('shows loading state initially', () => {
    render(<App />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('displays API status ok after successful fetch', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('ok')).toBeInTheDocument()
    })
  })

  it('displays unreachable on fetch failure', async () => {
    server.use(
      http.get('/api/health', () => {
        return HttpResponse.error()
      })
    )
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('unreachable')).toBeInTheDocument()
    })
  })
})
