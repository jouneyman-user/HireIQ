# Code Review Standards

> Standards for authoring, reviewing, and merging code in HireIQ. Read alongside [`CONSTITUTION.md`](./CONSTITUTION.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md), and [`SECURITY.md`](./SECURITY.md).

---

## Review Philosophy

Code review in HireIQ exists to:

1. **Catch problems early** — bugs, security issues, and design mistakes are cheapest to fix before they merge
2. **Share knowledge** — reviewers learn about changes; authors learn from feedback
3. **Enforce the constitution** — code that violates [`CONSTITUTION.md`](./CONSTITUTION.md) principles should not merge, regardless of functionality

**Tone:** Reviews are professional and specific. Comments identify the problem and suggest a solution. "This is wrong" is not a review comment; "This creates a CORS vulnerability because X — consider Y instead" is.

**Speed:** PRs that are not reviewed within 1 business day should be flagged. Blocking review creates idle time.

---

## Author Pre-Review Checklist

Complete this before requesting review. Reviewers may close a PR that skips these steps.

- [ ] Self-reviewed the full diff line by line — not just a skim
- [ ] Tests written and passing locally (`make lint` and `pytest` / `npm test`)
- [ ] No debug artifacts: no `print()`, `console.log()`, commented-out code, or `TODO` without a linked issue
- [ ] Follows naming conventions in [`CONSTITUTION.md`](./CONSTITUTION.md)
- [ ] New environment variables added to `.env.example` with comments
- [ ] Security checklist from [`SECURITY.md`](./SECURITY.md) reviewed — especially if touching auth, data, or CORS
- [ ] PR title follows Conventional Commits format: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- [ ] PR description explains **why** this change exists, not just what files changed
- [ ] Version bump follows [`VERSION_MANAGEMENT.md`](./VERSION_MANAGEMENT.md) if this is a release
- [ ] Module boundaries from [`ARCHITECTURE.md`](./ARCHITECTURE.md) respected — no cross-module imports

---

## Reviewer Checklist

Review in this order. Stop at the first blocker and comment rather than continuing through a fundamentally broken PR.

### 1. Correctness

- [ ] Does the logic actually solve the stated problem?
- [ ] Are all edge cases handled? (empty lists, null values, zero, negative numbers, max values)
- [ ] Are error paths handled and tested — not just the happy path?
- [ ] Do HTTP endpoints return appropriate status codes for all outcomes?
- [ ] Are async operations awaited? Are race conditions possible?

### 2. Architecture Fit

- [ ] Does this change respect module boundaries from [`ARCHITECTURE.md`](./ARCHITECTURE.md)? (`backend/` and `frontend/` must not import from each other)
- [ ] Does new functionality belong in the module where it was placed, or should it live elsewhere?
- [ ] Does this add new external dependencies? If so, are they justified against the "standard tooling" principle?
- [ ] Does this maintain backward compatibility for the API contract? (Adding fields is OK; removing or renaming is a breaking change)

### 3. Constitution Adherence

- [ ] Does this follow the principles in [`CONSTITUTION.md`](./CONSTITUTION.md)?
- [ ] Is configuration explicit (no magic defaults, no undocumented env vars)?
- [ ] Are any new operations idempotent where they need to be?
- [ ] Does this introduce complexity that should be deferred to a future milestone?

### 4. Test Quality

- [ ] Tests are meaningful — they test behaviour, not implementation details
- [ ] Tests cover edge cases, not just the happy path
- [ ] Tests are independent — order of execution doesn't matter
- [ ] Mocks are used appropriately — no mocking of the code under test
- [ ] Test names clearly describe what they verify: `test_health_returns_200_with_ok_status`
- [ ] Coverage meets project standards in [`UNIT_TESTING.md`](./UNIT_TESTING.md)

### 5. Security

- [ ] No secrets, credentials, or API keys in source code, comments, or commit messages
- [ ] No `allow_origins=["*"]` in CORS — explicit origins only
- [ ] Input validation is present for any user-supplied data
- [ ] SQL queries use SQLAlchemy ORM or parameterized statements — never f-strings in SQL
- [ ] Error messages do not expose stack traces or internal paths to clients
- [ ] See full checklist in [`SECURITY.md`](./SECURITY.md)

### 6. Performance

- [ ] No N+1 database queries (one query per item in a loop)
- [ ] No unbounded queries without pagination (no `SELECT *` without `LIMIT`)
- [ ] No unnecessary synchronous blocking in async routes

### 7. Observability

- [ ] New failure paths log meaningful error messages (not `except: pass`)
- [ ] Logs contain context (what failed, with what input, at what stage) — not just "error occurred"
- [ ] No sensitive data (passwords, tokens, PII) in log statements

### 8. Backwards Compatibility

- [ ] If an API field was removed or renamed: is a migration path documented?
- [ ] If the database schema changed: is there a migration script in `migrations/`?
- [ ] If `Makefile` targets changed: is `README.md` updated?

---

## AI-Generated Code Review

When reviewing a PR that contains AI-generated code (Claude Code, Copilot, etc.), apply the standard reviewer checklist **plus** these additional checks:

- [ ] **Logic verified independently** — do not assume AI-generated logic is correct because it looks plausible. Trace through the key paths manually
- [ ] **No hallucinated APIs** — verify every library call against the actual installed version (check `requirements.txt` / `package.json` and the library's documentation)
- [ ] **No undeclared dependencies** — AI sometimes writes `import X` for libraries not in `requirements.txt`. Check every new import
- [ ] **Tests cover more than the happy path** — AI tends to write tests that mostly verify the implementation it just wrote. Ensure adversarial cases are present
- [ ] **Security patterns match [`SECURITY.md`](./SECURITY.md)** — not generic LLM defaults (e.g., AI may generate `allow_origins=["*"]` for "simplicity")
- [ ] **Architecture matches [`ARCHITECTURE.md`](./ARCHITECTURE.md)** — AI may reinvent patterns that already exist (a new `DatabaseManager` class when `database.py` already handles this)
- [ ] **No model output used in security decisions** — if the AI-generated code uses any LLM output in an auth check or access control decision, reject immediately

---

## Project-Specific Red Flags

These are patterns that have been explicitly rejected or that commonly cause issues in this codebase:

| Red flag | Why it's a problem | Correct approach |
|----------|-------------------|-----------------|
| `allow_origins=["*"]` | Exposes CORS to any origin — even in dev, this is a bad habit | Explicit list: `["http://localhost:5173"]` |
| `hireiq.db` at repo root | Wrong relative path when uvicorn runs from `backend/` | SQLite file must be in `backend/hireiq.db` |
| `from backend import ...` in frontend | Violates module boundary — frontend is JS/TS only | Use `/api/*` HTTP endpoints |
| `except: pass` or `except Exception: pass` | Silent failures; impossible to debug | Log the exception and return an appropriate HTTP error |
| `@router.get("/api/health")` | Doubles the `/api` prefix since Vite proxy already adds it | Route must be `@router.get("/health")` |
| `Base.metadata.drop_all()` in a migration | Destroys production data if run in wrong environment | Never; use `create_all` or Alembic versioned migrations |
| Committing `backend/.env` | Secrets in version control | `.env` is in `.gitignore`; use `.env.example` |
| `init_db.py` without importing `app.main` | Models not registered with Base; `create_all` creates no tables | Always import `app.main` (or all model modules) before `create_all` |

---

## Merge Criteria

A PR may be merged when **all** of the following are true:

1. At least one non-author approval from a team member
2. All CI checks pass (lint + tests)
3. Author pre-review checklist completed (PR description confirms this)
4. No unresolved reviewer comments marked as blocking
5. PR description explains the *why* behind the change
6. If the change touches security, auth, CORS, migrations, or the Makefile: at least one approval from a senior engineer

---

## Escalation

Involve a senior engineer or architect when:

- The change modifies module boundaries (adding a new module, splitting an existing one)
- The change introduces a new external dependency
- There is genuine disagreement between reviewer and author that cannot be resolved in comments
- The change touches database schema (migrations)
- The change modifies `CONSTITUTION.md` or `ARCHITECTURE.md`
- A security reviewer has flagged a concern

When in doubt, get a second opinion. The cost of an extra review is always less than the cost of a production bug.

---

*Last updated: 2026-05-13 — M1 foundation scaffold.*
