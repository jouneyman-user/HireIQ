# 4656050996: updated footer with current year

> **Ticket:** [#16 — updated footer with current year](https://github.com/jouneyman-user/HireIQ/issues/16)
> **Source branch:** `main`
> **Working branch:** `4656050996_updated-footer-with-current-ye_724205`
> **Project:** HireIQ (frontend)
> **Author:** Issue Analysis & Spec Authoring Agent (autonomous)
> **Date:** 2026-06-17

---

## Summary

Issue #16 asks for the HireIQ web application to display a polished footer at the bottom of every page that (a) shows the **current year** (the ticket body specifies "2027") and (b) includes **branding** for the product. Today the React app has no footer element at all — `App.tsx` ends with the `<ResumeList />` component and nothing after it. The work is to introduce a new, self-contained `<AppFooter />` component, render it from `App.tsx` so it appears on every route, and prove the behavior with Vitest unit tests.

## Problem / Context

The HireIQ frontend (`frontend/src/App.tsx`) currently renders top-to-bottom: an `<h1>` heading, the resume upload form, the job-role form, generation status, and the resume list. There is **no footer element** in the DOM anywhere in the app — searches for `footer`, `Footer`, `copyright`, `©`, and explicit year strings (`2024`, `2025`, `2026`, `2027`) all return zero matches across `frontend/src/`, `frontend/index.html`, `frontend/src/index.css`, and the backend. The page therefore lacks:

- A persistent brand mark on screen (only the `<h1>HireIQ</h1>` at the top currently identifies the product).
- Any copyright / year statement — important both as a UX cue (recruiters expect to see a year stamp) and as a low-cost branding touchpoint.
- A visually grounded "end of page" element, which makes the layout feel like it just stops after the resume table.

The ticket body says "updated footer with current year. and also add some good footer with branding. add year as 2027" — i.e. the requester wants both a year display and a presentational/branding improvement. Because no footer exists at all today, this is a **greenfield component addition**, not a modification.

## Scope

**In scope**
- A new React component `frontend/src/components/AppFooter.tsx` that renders a footer with:
  - The brand wordmark **HireIQ** (matches the `<h1>` in `App.tsx`).
  - A short brand tagline / value statement.
  - The current calendar year (rendered via `new Date().getFullYear()`).
  - A copyright line of the form `© {year} HireIQ. All rights reserved.`
- Updating `frontend/src/App.tsx` to render `<AppFooter />` below the existing content, inside the same root `<div>`.
- Light inline styling consistent with the existing components (the project uses inline styles throughout — no new CSS file or framework is added).
- A corresponding Vitest unit test file `frontend/src/__tests__/AppFooter.test.tsx`.
- Updating `frontend/src/__tests__/App.test.tsx` with one assertion that the footer is rendered.

**Out of scope**
- Multi-page routing (the app is single-route; adding React Router is a separate concern).
- Server-side rendering changes — the footer year is computed client-side, which matches the existing SPA architecture.
- Backend changes — no API or DB schema is affected.
- Internationalisation (i18n) — copy is English only, consistent with the rest of the UI.
- A new CSS framework / Tailwind / design system — only inline styles and the existing CSS variables in `frontend/src/index.css` (e.g. `var(--border)`, `var(--text)`, `var(--accent)`) are used.
- Footer link destinations (Privacy, Terms, etc.) — there are no such pages yet; placeholder links are not added.

## Affected Code

The following files were inspected to confirm relevance and to scope the change. No other files in the repo currently render or relate to a footer.

| Path | Status | Why it matters |
|---|---|---|
| `frontend/src/App.tsx` | **Modify** | The root component. This is where `<AppFooter />` must be rendered so it appears on every view. |
| `frontend/src/components/AppFooter.tsx` | **New** | The new component. Lives alongside `JobRoleForm.tsx`, `ResumeList.tsx`, `ResumeUpload.tsx` in `frontend/src/components/`. |
| `frontend/src/index.css` | Reference only | Defines the CSS custom properties (`--border`, `--text`, `--text-h`, `--bg`, `--accent`) that the footer styling will reuse so it stays visually consistent with the rest of the page in both light and dark mode. |
| `frontend/src/__tests__/AppFooter.test.tsx` | **New** | Vitest + Testing Library tests for the new component (renders wordmark, tagline, current year, copyright line). |
| `frontend/src/__tests__/App.test.tsx` | **Modify** | Add an assertion that the footer is present after the resume list. |
| `frontend/index.html` | Reference only | The page `<title>frontend</title>` is left untouched in this issue — renaming it is not required by the ticket and would broaden scope. |

No backend files (`backend/app/**`) are affected — confirmed by reading `App.tsx`'s import list (only frontend components) and by `grep` for `footer`/`Footer`/`copyright` across `backend/` returning no matches.

## Proposed Approach

### Design overview

A single new component, rendered as the last child of the root `<div>` in `App.tsx`, separated from the content above it by a horizontal rule (matching the existing visual language in `App.tsx`, which already uses `<hr>` between sections).

```
┌────────────────────────────────────────────────────────────┐
│ HireIQ                                          ← <h1>     │
│  … Upload / Form / Results / Resumes table …               │
│ ───────────────────────────────────────────────  ← <hr>    │
│ HireIQ — AI-powered interview prep               ← footer  │
│ © 2027 HireIQ. All rights reserved.             ← footer  │
└────────────────────────────────────────────────────────────┘
```

The footer is a small two-line block: brand tagline on top, copyright line below. Both are centered, muted (using `var(--text)`), and use the same `sans-serif` stack as the rest of the app.

### Step 1 — Create `frontend/src/components/AppFooter.tsx`

```tsx
const APP_NAME = 'HireIQ'
const TAGLINE = 'AI-powered interview prep for modern recruiting teams.'

function getCurrentYear(): number {
  return new Date().getFullYear()
}

export function AppFooter() {
  const year = getCurrentYear()
  return (
    <footer
      role="contentinfo"
      aria-label={`${APP_NAME} footer`}
      style={{
        marginTop: '3rem',
        paddingTop: '1.25rem',
        borderTop: '1px solid var(--border)',
        textAlign: 'center',
        color: 'var(--text)',
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-h)' }}>
        {APP_NAME}
        <span style={{ fontWeight: 400, color: 'var(--text)' }}>
          {' '}— {TAGLINE}
        </span>
      </p>
      <p style={{ margin: '0.25rem 0 0' }}>
        © {year} {APP_NAME}. All rights reserved.
      </p>
    </footer>
  )
}
```

Key decisions:
- `role="contentinfo"` makes the landmark discoverable to assistive tech; `aria-label` names it. This follows the same a11y discipline used elsewhere in the app (the `QuestionSkeleton` from issue #5 uses `role="status"` + `aria-label`).
- Year is computed via `new Date().getFullYear()`, **not hard-coded** to "2027". The ticket body says "add year as 2027" — this is treated as an example/clarification of "current year", consistent with the ticket title. Using a hard-coded `2027` would make the footer go stale every January 1 and require an annual maintenance ticket; using `getFullYear()` is the standard, correct implementation. (See Risks & Open Questions for the alternative interpretation.)
- `var(--border)`, `var(--text)`, `var(--text-h)` are picked up from `frontend/src/index.css` so the footer automatically adapts to the dark-mode `@media (prefers-color-scheme: dark)` block that already exists there.
- Inline styles only — matches the convention of every other component in `frontend/src/components/`.

### Step 2 — Render `<AppFooter />` in `App.tsx`

In `frontend/src/App.tsx`, add the import next to the existing component imports and render it as the last child of the root `<div>`, after `<ResumeList />`:

```tsx
import { AppFooter } from './components/AppFooter'
// …existing imports unchanged…

return (
  <div style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
    <h1>HireIQ</h1>
    <ResumeUpload onUploaded={handleUploaded} />
    <hr style={{ margin: '2rem 0' }} />
    <JobRoleForm onSubmit={handleGenerate} disabled={!activeResumeId || generating} />
    {!activeResumeId && (
      <p style={{ color: '#888', marginTop: 8 }}>
        Upload a resume to enable question generation.
      </p>
    )}
    {generateError && <p style={{ color: 'red' }}>{generateError}</p>}
    {generateResult && <p style={{ color: 'green' }}>{generateResult.message}</p>}
    <h2>Uploaded Resumes</h2>
    <ResumeList resumes={resumes} />
    <AppFooter />
  </div>
)
```

No other change to `App.tsx` is needed — types, state, and the generate flow are untouched.

### Step 3 — Tests

**New file `frontend/src/__tests__/AppFooter.test.tsx`:**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AppFooter } from '../components/AppFooter'

describe('AppFooter', () => {
  it('renders a contentinfo landmark', () => {
    render(<AppFooter />)
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  it('shows the HireIQ brand wordmark', () => {
    render(<AppFooter />)
    expect(screen.getByText(/HireIQ/)).toBeInTheDocument()
  })

  it('shows the brand tagline', () => {
    render(<AppFooter />)
    expect(screen.getByText(/AI-powered interview prep/i)).toBeInTheDocument()
  })

  it('renders the current calendar year', () => {
    render(<AppFooter />)
    const year = new Date().getFullYear()
    expect(screen.getByText(new RegExp(`© ${year} HireIQ`))).toBeInTheDocument()
  })

  it('includes the copyright line', () => {
    render(<AppFooter />)
    expect(screen.getByText(/All rights reserved/i)).toBeInTheDocument()
  })
})
```

**Update `frontend/src/__tests__/App.test.tsx`:**

Add a single assertion to the existing `App` describe block:

```tsx
it('renders the brand footer with the current year', () => {
  const year = new Date().getFullYear()
  render(<App />)
  expect(
    screen.getByText(new RegExp(`© ${year} HireIQ`, 'i'))
  ).toBeInTheDocument()
})
```

The existing MSW handler setup, `beforeAll/afterEach/afterAll`, and eight existing test cases are left untouched.

## Data / API / Schema Changes

**None.** No HTTP endpoint, request body, response shape, database table, environment variable, or config file is modified by this ticket. The change is purely presentational on the React frontend.

## Acceptance Criteria

Each item is independently testable.

1. After `make dev`, the page served at `http://localhost:5173` displays a `<footer role="contentinfo">` element at the bottom.
2. The footer contains the text **HireIQ** (the brand wordmark).
3. The footer contains the tagline **"AI-powered interview prep for modern recruiting teams."** (case-insensitive match is acceptable).
4. The footer contains the line **`© {currentYear} HireIQ. All rights reserved.`** where `{currentYear}` equals the year returned by `new Date().getFullYear()` on the client at render time.
5. The footer's separator (border-top) visually distinguishes it from the resume list above it.
6. The footer is visually consistent in both light and dark mode (uses `var(--border)` / `var(--text)` from `frontend/src/index.css`).
7. `cd frontend && npm test` passes — including the new `AppFooter.test.tsx` cases and the new `App.test.tsx` assertion.
8. `make lint` and `make test` pass with no new warnings.
9. No backend file is modified (verified with `git diff --stat main -- backend/` returning empty).

## Testing Strategy

- **Unit (Vitest + Testing Library):** New `AppFooter.test.tsx` covers the contentinfo landmark, brand wordmark, tagline, dynamic year, and copyright line. The pattern mirrors `frontend/src/__tests__/App.test.tsx` (same tooling, same idioms — `render`, `screen.getByRole`, `screen.getByText`).
- **Integration:** One new assertion in `App.test.tsx` confirms `<AppFooter />` is mounted inside `<App />`.
- **Manual smoke:** Open `http://localhost:5173` after `make dev`, scroll to the bottom, confirm the footer is visible, the year matches the current year, and the footer text does not wrap awkwardly at default desktop width (≥ 960 px). In dark OS mode, confirm the footer adopts the muted `--text` colour automatically.
- **Coverage:** Existing coverage threshold is 80% (per `README.md`). Adding the five-test `AppFooter.test.tsx` keeps the new component well above this threshold.
- **No new tooling:** No new dev dependencies, no new MSW handlers (the footer renders no async data).

## Assumptions

The following decisions were made autonomously because the ticket body is short and gives no human to ask. Each is defensible from context but is flagged so a reviewer can override.

1. **"current year" is dynamic, not hard-coded to "2027".** The ticket title says "updated footer with current year" and the body says "add year as 2027". Treated as: 2027 is the *example* value the requester had in mind when writing the ticket, and the intent is that the footer should always show the actual current year. Implemented via `new Date().getFullYear()`.
2. **Branding text is the product name + a short tagline.** "Good footer with branding" is open to interpretation. The product name is already established as **HireIQ** (see `<h1>HireIQ</h1>` in `App.tsx` and the repo's `README.md`). A short descriptive tagline ("AI-powered interview prep for modern recruiting teams.") is added to make the footer feel substantive rather than just a copyright line. If the requester prefers a different tagline (e.g. "Made with ♥ for recruiters"), it is a single string change.
3. **No external links (Privacy / Terms / Contact).** No such pages exist in the repo and adding placeholder `href="#"` links would be misleading.
4. **Footer uses inline styles + CSS custom properties from `index.css`.** This matches every other component in the app. A new `AppFooter.css` file is not introduced.
5. **No routing changes.** The footer is rendered once at the bottom of `App.tsx`. If/when React Router is introduced in a later milestone, the footer should be hoisted into the router layout — flagged in Risks.
6. **No `data-testid`.** All new tests use semantic queries (`getByRole('contentinfo')`, `getByText`) per the testing conventions described in `UNIT_TESTING.md`.

## Risks & Open Questions

| Risk / Question | Mitigation |
|---|---|
| **Year interpretation** — If the requester literally wanted a hard-coded string `"2027"` (e.g. for a marketing screenshot taken in 2027) the dynamic implementation would still show 2027 today but would silently roll to 2028 on Jan 1 2028. | The implementation is functionally equivalent at the moment the ticket was filed and is more correct long-term. If the team wants the literal string, replacing `getCurrentYear()` with `2027` is a one-line change. Worth confirming in PR review. |
| **Tagline copy** — The tagline "AI-powered interview prep for modern recruiting teams." is invented. The repo's README also describes HireIQ as a "hiring intelligence platform". | The tagline is a single constant at the top of `AppFooter.tsx`; trivial to change. PR review should confirm wording. |
| **Future multi-page routing** — If/when the app gains React Router, a footer rendered inside `<App />` may render twice (once per route). | Re-render `<AppFooter />` once at the router-layout level instead. Out of scope for this issue; flagged for the routing milestone. |
| **Screen-reader semantics** — `role="contentinfo"` is the implicit ARIA role for `<footer>`, so it could be redundant. | Both forms are valid; explicit `role="contentinfo"` is defensive and harmless. |
| **i18n** — Footer text is English-only, matching the rest of the UI. | Acceptable for M2; revisit when i18n is introduced. |
| **Dark-mode contrast** — `--text` in dark mode is `#9ca3af` on `--bg: #16171d`, which is contrast-compliant for body copy. The copyright line uses `--text`; the brand line uses `--text-h` (white-ish) for the wordmark and `--text` for the tagline. | Verified mentally against `frontend/src/index.css`; manual smoke in dark mode should confirm. |

## Estimation

- **Story points:** **1** (Fibonacci). One small, well-scoped component, one wiring change in `App.tsx`, two small test files. No backend, no schema, no migration, no architectural decisions, no new dependencies. The component is fully self-contained.
- **Effort estimate:** **~0.25 dev-days** (~2 hours). Most of the time will be writing tests and the visual smoke check in light + dark mode.
- **Confidence:** **High**. The change is small, the scope is unambiguous (footer only), the project already uses inline styles and CSS custom properties so there is no tooling to learn, and there is exactly one place (`App.tsx`) where the new component needs to be mounted.

---

*Spec generated autonomously by the Ticket Analysis & Spec Authoring Agent for issue #16 — 2026-06-17.*
