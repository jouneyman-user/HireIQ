import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { JobRoleForm, JobRoleData } from '../components/JobRoleForm'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderForm(onSubmit = vi.fn(), disabled = false) {
  render(<JobRoleForm onSubmit={onSubmit} disabled={disabled} />)
}

async function fillJobTitle(value: string) {
  const input = screen.getByLabelText(/job title/i)
  await userEvent.clear(input)
  await userEvent.type(input, value)
}

async function selectSeniority(value: string) {
  const select = screen.getByLabelText(/seniority level/i)
  await userEvent.selectOptions(select, value)
}

async function addSkill(skill: string) {
  const skillInput = screen.getByLabelText(/key skills/i)
  await userEvent.clear(skillInput)
  await userEvent.type(skillInput, skill)
  await userEvent.keyboard('{Enter}')
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('JobRoleForm — rendering', () => {
  it('renders job title input', () => {
    renderForm()
    expect(screen.getByLabelText(/job title/i)).toBeInTheDocument()
  })

  it('renders seniority level dropdown', () => {
    renderForm()
    expect(screen.getByLabelText(/seniority level/i)).toBeInTheDocument()
  })

  it('renders key skills input', () => {
    renderForm()
    expect(screen.getByLabelText(/key skills/i)).toBeInTheDocument()
  })

  it('renders generate questions button', () => {
    renderForm()
    expect(screen.getByRole('button', { name: /generate questions/i })).toBeInTheDocument()
  })

  it('renders clear button', () => {
    renderForm()
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument()
  })

  it('renders all seniority options', () => {
    renderForm()
    const select = screen.getByLabelText(/seniority level/i) as HTMLSelectElement
    const options = Array.from(select.options).map((o) => o.value)
    expect(options).toContain('Junior')
    expect(options).toContain('Mid-Level')
    expect(options).toContain('Senior')
    expect(options).toContain('Lead')
    expect(options).toContain('Principal')
  })
})

// ---------------------------------------------------------------------------
// Validation — submit with empty / partial fields
// ---------------------------------------------------------------------------

describe('JobRoleForm — validation', () => {
  it('shows error when job title is empty on submit', async () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: /generate questions/i }))
    expect(await screen.findByText(/job title is required/i)).toBeInTheDocument()
  })

  it('shows error when seniority is not selected', async () => {
    renderForm()
    await fillJobTitle('Engineer')
    fireEvent.click(screen.getByRole('button', { name: /generate questions/i }))
    expect(await screen.findByText(/seniority level is required/i)).toBeInTheDocument()
  })

  it('shows error when no skills are added', async () => {
    renderForm()
    await fillJobTitle('Engineer')
    await selectSeniority('Senior')
    fireEvent.click(screen.getByRole('button', { name: /generate questions/i }))
    expect(await screen.findByText(/at least one key skill is required/i)).toBeInTheDocument()
  })

  it('does not call onSubmit when validation fails', async () => {
    const onSubmit = vi.fn()
    renderForm(onSubmit)
    fireEvent.click(screen.getByRole('button', { name: /generate questions/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Skill tag management
// ---------------------------------------------------------------------------

describe('JobRoleForm — skill tag management', () => {
  it('adds a skill tag on Enter keypress', async () => {
    renderForm()
    await addSkill('TypeScript')
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
  })

  it('adds a skill tag on Add button click', async () => {
    renderForm()
    const skillInput = screen.getByLabelText(/key skills/i)
    await userEvent.type(skillInput, 'React')
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    expect(screen.getByText('React')).toBeInTheDocument()
  })

  it('does not add empty skill', async () => {
    renderForm()
    const skillInput = screen.getByLabelText(/key skills/i)
    await userEvent.clear(skillInput)
    await userEvent.keyboard('{Enter}')
    // No tag spans should appear other than the form elements
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
  })

  it('does not add duplicate skill', async () => {
    renderForm()
    await addSkill('React')
    await addSkill('React')
    const tags = screen.getAllByText('React')
    // The skill text appears once in the tag span (the × button is a sibling)
    expect(tags).toHaveLength(1)
  })

  it('removes skill tag on × click', async () => {
    renderForm()
    await addSkill('TypeScript')
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /remove typescript/i }))
    expect(screen.queryByText('TypeScript')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Clear button
// ---------------------------------------------------------------------------

describe('JobRoleForm — clear button', () => {
  it('resets job title, seniority, and skills', async () => {
    renderForm()
    await fillJobTitle('Engineer')
    await selectSeniority('Senior')
    await addSkill('TypeScript')

    fireEvent.click(screen.getByRole('button', { name: /clear/i }))

    expect((screen.getByLabelText(/job title/i) as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText(/seniority level/i) as HTMLSelectElement).value).toBe('')
    expect(screen.queryByText('TypeScript')).not.toBeInTheDocument()
  })

  it('clear does not call onSubmit', async () => {
    const onSubmit = vi.fn()
    renderForm(onSubmit)
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('clear removes inline validation errors', async () => {
    renderForm()
    // Trigger validation errors first
    fireEvent.click(screen.getByRole('button', { name: /generate questions/i }))
    expect(await screen.findByText(/job title is required/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(screen.queryByText(/job title is required/i)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Happy path — valid submission
// ---------------------------------------------------------------------------

describe('JobRoleForm — happy path', () => {
  it('calls onSubmit with correct data when form is valid', async () => {
    const onSubmit = vi.fn()
    renderForm(onSubmit)

    await fillJobTitle('Frontend Engineer')
    await selectSeniority('Senior')
    await addSkill('TypeScript')
    await addSkill('React')

    fireEvent.click(screen.getByRole('button', { name: /generate questions/i }))

    expect(onSubmit).toHaveBeenCalledOnce()
    const arg: JobRoleData = onSubmit.mock.calls[0][0]
    expect(arg.jobTitle).toBe('Frontend Engineer')
    expect(arg.seniorityLevel).toBe('Senior')
    expect(arg.keySkills).toEqual(['TypeScript', 'React'])
  })
})

// ---------------------------------------------------------------------------
// Disabled state
// ---------------------------------------------------------------------------

describe('JobRoleForm — disabled state', () => {
  it('disables all inputs when disabled prop is true', () => {
    renderForm(vi.fn(), true)
    expect(screen.getByLabelText(/job title/i)).toBeDisabled()
    expect(screen.getByLabelText(/seniority level/i)).toBeDisabled()
    expect(screen.getByLabelText(/key skills/i)).toBeDisabled()
    expect(screen.getByRole('button', { name: /generate questions/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /clear/i })).toBeDisabled()
  })
})
