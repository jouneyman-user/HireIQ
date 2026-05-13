# HireIQ Constitution

> The governing principles of this codebase. Every rule is traceable to evidence in the repository. New contributors — human and AI — must read this before writing a single line.

---

## Mission

HireIQ is a **hiring intelligence platform** that streamlines and augments the recruitment process. Its software exists to reduce friction for hiring teams, not to demonstrate technical sophistication. At every milestone, the system must be fully working — not architecturally impressive and partially functional.

---

## Core Principles

These are non-negotiable. They were established by deliberate architectural choices at M1 and apply to every subsequent change.

### 1. Zero-Friction Developer Experience

A new contributor must be able to go from `git clone` to a running system with three commands:

```bash
make install && make migrate && make dev
```

**Evidence:** The spec (Option 1 chosen over Docker and workspace tooling) explicitly rejected any approach that "adds prerequisites." No Docker Desktop, no PNPM, no Poetry — because each is a barrier to entry.

**Rule:** Before adding any tooling dependency, ask: *Is this essential now, or can it wait?* If it can wait, it waits.

---

### 2. Standard Tooling Over Specialized Tooling

Use the tool that most developers already have. Prefer the ecosystem default.

| Layer | Tool chosen | Tool rejected | Reason |
|-------|-------------|---------------|--------|
| Python deps | `pip` + `requirements.txt` | Poetry | "Non-standard; adds learning curve" |
| Node deps | `npm` | PNPM, Yarn | "PNPM not universally installed" |
| Orchestration | `make` | `concurrently`, Turborepo | "Universally understood" |

**Evidence:** Option 3 (Poetry + PNPM workspaces) was explicitly rejected as "unnecessary complexity when there is only one frontend package."

**Rule:** Any new tool must be justified against: *"Is npm/pip/make sufficient for this?"*

---

### 3. Solve for Today's Scale, Not Tomorrow's

Build what is needed. Defer what is not. The architecture is intentionally evolvable.

| Today (M1) | Tomorrow (M2+) |
|------------|----------------|
| SQLite | PostgreSQL (when SQLite's concurrency limits matter) |
| `Base.metadata.create_all` | Alembic (when schema migrations need versioning) |
| Makefile `&` for concurrency | `concurrently` or Docker Compose (when DX warrants it) |
| No authentication | Auth middleware (when the app needs users) |

**Evidence:** Spec explicitly states "Alembic is sufficient and simpler for M1; migrate to Alembic when the first schema change is needed in M2+."

**Rule:** Every "we should add X" proposal must answer: *"What M1 problem does X solve that the current approach cannot?"*

---

### 4. Module Boundaries Are Inviolable

The repository is a **flat monorepo** with two application modules:

- `backend/` — owns all API logic, database schema, and business rules
- `frontend/` — owns all UI, client state, and build configuration

Neither module may import from, directly call, or embed code belonging to the other. Communication is exclusively via HTTP through the Vite proxy.

**Evidence:** Spec directory structure shows `backend/` and `frontend/` as sibling directories; React communicates via `/api/*` proxy, not direct Python imports.

**Rule:** If a function is in `backend/`, it is not available to `frontend/` except via an API endpoint. No exceptions.

---

### 5. Explicit Configuration Over Magic Defaults

Configuration is visible, documented, and overrideable. No hidden defaults that differ between environments.

**Evidence:**
- CORS is explicitly whitelisted for `http://localhost:5173` — not `allow_origins=["*"]`
- `DATABASE_URL` has an explicit default: `sqlite:///./hireiq.db`
- Vite proxy rewrite is explicitly configured: `/api` → `` (empty) so FastAPI routes stay clean
- `.env.example` commits the schema; `.env` is gitignored

**Rule:** Every environment variable must appear in `.env.example` with a comment. Every middleware must be configured with explicit values. No implicit trust.

---

### 6. Idempotent Operations

Database migrations, setup scripts, and any stateful initialization must be safe to run multiple times with no side effects.

**Evidence:** `migrations/init_db.py` uses `Base.metadata.create_all(bind=engine)` which creates tables if they don't exist and does nothing if they do. The spec explicitly notes: *"Idempotent — safe to run multiple times; existing tables are not dropped."*

**Rule:** `make migrate` must always be a safe command. If a migration is not idempotent, it is not a migration — it is a destructive script and must be named accordingly.

---

### 7. TypeScript for All Frontend Code

The React application uses TypeScript exclusively. No `.js` or `.jsx` files in `frontend/src/`.

**Evidence:** Spec bootstraps via `npm create vite@latest frontend -- --template react-ts` and notes "TypeScript provides superior DX from day one."

**Rule:** All new frontend code is `.tsx` (components) or `.ts` (utilities/types). Runtime type assertions (`as any`, `@ts-ignore`) require a comment explaining why.

---

### 8. Python 3.10+ for All Backend Code

The backend uses Python 3.10 or higher. Pattern matching, `X | Y` union types, and structural typing are available and preferred over older equivalents.

**Evidence:** Spec lists Python ≥ 3.10 as a prerequisite.

**Rule:** Do not write code that degrades to Python 3.8/3.9 compatibility. `requirements.txt` should not need to pin packages to versions that predate 3.10.

---

## What We Optimize For

Ranked priorities — when two good things conflict, earlier items win:

1. **Developer productivity** — fast feedback loops, minimal setup, clear errors
2. **Code clarity** — readable over clever; explicit over implicit
3. **Evolvability** — today's choices should not block tomorrow's migration
4. **Correctness** — well-tested, well-typed, no silent failures

Performance and scalability are *not* in the top four for M1. They become relevant when we have real users.

---

## What We Explicitly Avoid

These are anti-patterns that have been consciously rejected:

| Anti-pattern | Why rejected |
|-------------|-------------|
| `allow_origins=["*"]` in CORS | Overly permissive; every deployment exposes a different surface |
| `hireiq.db` in repo root | Ambiguous path resolution; must live in `backend/` |
| Cross-module imports (frontend ↔ backend) | Breaks the monorepo contract; creates coupling |
| Premature abstraction (repositories, DI frameworks) | Unjustified complexity at M1 scale |
| Alternative package managers (PNPM, Yarn, Poetry) | Extra prerequisites with no M1 benefit |
| Hardcoded secrets or credentials | Self-evidently forbidden |
| Tests that only cover the happy path | Gives false confidence; edge cases matter |

---

## Decision Framework

Before any structural change to the codebase, answer these questions:

1. **Does this add a new prerequisite?** If yes, is it essential for *this milestone*? (Not next milestone, this one.)
2. **Does this respect module boundaries?** Would `backend/` know about `frontend/` or vice versa?
3. **Is this idempotent?** Can it be run twice safely?
4. **Can a new developer understand this in < 5 minutes?** If not, can it be made simpler?
5. **What's the migration path away from this decision?** (Even if we never migrate.)

If a change cannot answer all five questions clearly, it needs more design time.

---

## Quality Bar

A piece of work is not "done" until it meets all of the following:

- [ ] All routes return appropriate HTTP status codes (200, 400, 404, 422, 500 as appropriate)
- [ ] Error responses are structured JSON — never raw Python exceptions or stack traces to the client
- [ ] New environment variables appear in `.env.example` with an explanatory comment
- [ ] Database changes go through a migration script in `migrations/`
- [ ] Unit tests cover the new behaviour (backend: pytest; frontend: Vitest)
- [ ] TypeScript: no new `any` types without justification comment
- [ ] `make lint` passes without warnings
- [ ] `README.md` updated if setup steps change

---

## Ownership Model

| Scope | Owner | Requires cross-review? |
|-------|-------|----------------------|
| `backend/app/` and `backend/migrations/` | Backend developers | Only when API contract changes |
| `frontend/src/` | Frontend developers | Only when API calls change |
| `Makefile` | All teams | Yes — affects every developer |
| `README.md` | All teams | Yes — the first thing new developers read |
| `docs/` | All teams | Yes — shared knowledge |
| `.gitignore`, `.env.example` | All teams | Yes — affects repo hygiene |

---

## AI Agent Addendum

This section governs how AI coding agents (Claude Code, Copilot, etc.) operate in this repository.

### Rules that apply equally to AI-generated code

All eight Core Principles apply to AI-generated code. An AI agent that violates module boundaries, adds undocumented dependencies, or skips tests is producing code that will be rejected in review — regardless of how confident the model is.

### What always requires human review

1. **Changes to `Makefile`** — affects every developer's workflow
2. **Changes to `database.py`** — SQLAlchemy engine configuration affects data integrity
3. **Changes to CORS configuration** — security surface
4. **New `requirements.txt` or `package.json` dependencies** — supply chain risk
5. **Any code in `migrations/`** — irreversible if wrong
6. **Any change to this document** — see Evolution Policy below

### Prohibited shortcuts

AI agents must not:

- Skip writing tests ("we'll add tests later")
- Use `allow_origins=["*"]` even temporarily
- Add `# type: ignore` or `@ts-ignore` without an explanatory comment
- Introduce dependencies not in `requirements.txt` or `package.json`
- Commit `.env` files or any file containing actual credentials
- Bypass the `make lint` gate by modifying lint configuration to ignore errors

---

## Evolution Policy

This document evolves when the codebase outgrows a principle — not when it is inconvenient.

**Amendment process:**
1. Open a PR with the proposed change to `CONSTITUTION.md`
2. PR description must include: *what changed, why, and what evidence from the codebase justifies the change*
3. Requires at minimum one non-author approval from a team lead or architect
4. The principle being changed must have a comment in the PR explaining whether existing code needs to be updated to conform

**Who has veto:** Any team lead or architect can veto a constitutional change. Vetoes must be written and reasoned — not just "I don't like it."

---

*Last updated: 2026-05-13 — Established at M1 foundation.*
