// frontend/src/__tests__/ResumeUpload.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { ResumeUpload } from '../components/ResumeUpload'

const server = setupServer()

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('ResumeUpload', () => {
  describe('initial render', () => {
    it('renders a file input with aria-label "Resume file"', () => {
      render(<ResumeUpload />)
      expect(screen.getByLabelText(/resume file/i)).toBeInTheDocument()
    })

    it('renders an upload button that is initially disabled', () => {
      render(<ResumeUpload />)
      expect(screen.getByRole('button', { name: /^upload$/i })).toBeDisabled()
    })

    it('does not show any error alert initially', () => {
      render(<ResumeUpload />)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('client-side validation', () => {
    it('shows error alert when user selects an unsupported file type', async () => {
      const user = userEvent.setup()
      render(<ResumeUpload />)

      const input = screen.getByLabelText(/resume file/i)
      const file = new File(['content'], 'resume.doc', { type: 'application/msword' })
      await user.upload(input, file)

      expect(screen.getByRole('alert')).toHaveTextContent(/only pdf or \.txt/i)
    })

    it('shows error alert when user selects a file over 5 MB', async () => {
      const user = userEvent.setup()
      render(<ResumeUpload />)

      const input = screen.getByLabelText(/resume file/i)
      const bigContent = 'x'.repeat(5 * 1024 * 1024 + 1)
      const file = new File([bigContent], 'big.pdf', { type: 'application/pdf' })
      await user.upload(input, file)

      expect(screen.getByRole('alert')).toHaveTextContent(/5 mb or smaller/i)
    })

    it('enables upload button when a valid file is selected', async () => {
      const user = userEvent.setup()
      render(<ResumeUpload />)

      const input = screen.getByLabelText(/resume file/i)
      const file = new File(['resume content'], 'resume.pdf', { type: 'application/pdf' })
      await user.upload(input, file)

      expect(screen.getByRole('button', { name: /^upload$/i })).toBeEnabled()
    })

    it('clears any previous error when a valid file is selected', async () => {
      const user = userEvent.setup()
      render(<ResumeUpload />)

      const input = screen.getByLabelText(/resume file/i)

      // First pick an invalid file to trigger error
      const bad = new File(['x'], 'bad.exe', { type: 'application/x-msdownload' })
      await user.upload(input, bad)
      expect(screen.getByRole('alert')).toBeInTheDocument()

      // Then pick a valid file — error should clear
      const good = new File(['content'], 'good.txt', { type: 'text/plain' })
      await user.upload(input, good)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('form submission — success', () => {
    it('shows success message with filename after upload', async () => {
      server.use(
        http.post('/api/candidates/resume', () =>
          HttpResponse.json(
            {
              id: 42,
              filename: 'alice_resume.pdf',
              uploaded_at: '2026-05-15T10:00:00+00:00',
              text_preview: 'Alice Johnson, Senior Engineer',
            },
            { status: 201 }
          )
        )
      )

      const user = userEvent.setup()
      render(<ResumeUpload />)

      const input = screen.getByLabelText(/resume file/i)
      await user.upload(input, new File(['pdf bytes'], 'alice_resume.pdf', { type: 'application/pdf' }))
      await user.click(screen.getByRole('button', { name: /^upload$/i }))

      await waitFor(() => {
        expect(screen.getByText(/uploaded/i)).toBeInTheDocument()
        expect(screen.getByText('alice_resume.pdf')).toBeInTheDocument()
      })
    })

    it('shows text preview from API response', async () => {
      server.use(
        http.post('/api/candidates/resume', () =>
          HttpResponse.json(
            {
              id: 1,
              filename: 'resume.txt',
              uploaded_at: '2026-05-15T10:00:00+00:00',
              text_preview: 'John Doe Resume Preview',
            },
            { status: 201 }
          )
        )
      )

      const user = userEvent.setup()
      render(<ResumeUpload />)

      const input = screen.getByLabelText(/resume file/i)
      await user.upload(input, new File(['content'], 'resume.txt', { type: 'text/plain' }))
      await user.click(screen.getByRole('button', { name: /^upload$/i }))

      await waitFor(() => {
        expect(screen.getByText(/John Doe Resume Preview/)).toBeInTheDocument()
      })
    })
  })

  describe('form submission — error', () => {
    it('shows API error detail on 400 response', async () => {
      server.use(
        http.post('/api/candidates/resume', () =>
          HttpResponse.json(
            { detail: 'File exceeds the 5 MB limit. Please upload a smaller file.' },
            { status: 400 }
          )
        )
      )

      const user = userEvent.setup()
      render(<ResumeUpload />)

      const input = screen.getByLabelText(/resume file/i)
      await user.upload(input, new File(['bytes'], 'resume.pdf', { type: 'application/pdf' }))
      await user.click(screen.getByRole('button', { name: /^upload$/i }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('File exceeds the 5 MB limit.')
      })
    })

    it('shows network error message on fetch failure', async () => {
      server.use(
        http.post('/api/candidates/resume', () => HttpResponse.error())
      )

      const user = userEvent.setup()
      render(<ResumeUpload />)

      const input = screen.getByLabelText(/resume file/i)
      await user.upload(input, new File(['bytes'], 'resume.pdf', { type: 'application/pdf' }))
      await user.click(screen.getByRole('button', { name: /^upload$/i }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/network error/i)
      })
    })

    it('shows loading text on button while uploading', async () => {
      let resolveUpload!: () => void
      server.use(
        http.post('/api/candidates/resume', () =>
          new Promise((resolve) => {
            resolveUpload = () =>
              resolve(
                HttpResponse.json(
                  { id: 1, filename: 'r.pdf', uploaded_at: '', text_preview: '' },
                  { status: 201 }
                )
              )
          })
        )
      )

      const user = userEvent.setup()
      render(<ResumeUpload />)

      const input = screen.getByLabelText(/resume file/i)
      await user.upload(input, new File(['bytes'], 'r.pdf', { type: 'application/pdf' }))
      user.click(screen.getByRole('button', { name: /^upload$/i }))

      await waitFor(() => {
        expect(screen.getByRole('button')).toHaveTextContent(/uploading/i)
      })

      resolveUpload()
    })
  })
})
