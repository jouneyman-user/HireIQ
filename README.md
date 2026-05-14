# HireIQ

> A hiring intelligence platform that helps teams manage and augment recruitment workflows.
> FastAPI · SQLite · React 18 · TypeScript · Vite · GNU Make

---

## Quick Start

Three commands take you from a fresh clone to a fully running system:

```bash
make install   # Install Python + Node dependencies
make migrate   # Initialise the SQLite database (idempotent — safe to repeat)
make dev       # Start backend (port 8000) + frontend (port 5173) concurrently
```

Open **http://localhost:5173** in your browser. That's it.

---

## Prerequisites

| Tool | Minimum version | How to install |
|------|----------------|---------------|
| Python | 3.10 | [python.org](https://www.python.org/downloads/) or `pyenv install 3.10` |
| Node.js | 18 | [nodejs.org](https://nodejs.org/) or `nvm install 18` |
| npm | 8 | Bundled with Node.js |
| GNU Make | Any | macOS: `xcode-select --install` · Linux: `apt install make` · Windows: Git Bash |

Verify your environment:

```bash
python3 --version   # >= 3.10
node --version      # >= 18
npm --version       # >= 8
make --version
```

---

## Development Setup

### 1. Clone & install

```bash
git clone https://github.com/jouneyman-user/HireIQ.git
cd HireIQ
make install
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
# Edit backend/.env if you need non-default values (defaults work out of the box)
```

### 3. Initialise the database

```bash
make migrate
```

Creates `backend/hireiq.db`. Safe to run multiple times — existing tables are never dropped.

### 4. Start development servers

```bash
make dev
```

| Service | URL |
|---------|-----|
| Frontend (React/Vite) | http://localhost:5173 |
| Backend API (FastAPI) | http://localhost:8000 |
| API docs (Swagger UI) | http://localhost:8000/docs |
| API docs (ReDoc) | http://localhost:8000/redoc |

**Note:** `Ctrl+C` stops the frontend (Vite). If uvicorn keeps running on port 8000, kill it:

```bash
kill $(lsof -ti:8000)
```

---

## Makefile Targets

```bash
make install        # pip install + npm install
make migrate        # Initialise SQLite schema
make dev            # Start backend + frontend in dev mode
make lint           # Run ruff (backend) + ESLint + tsc --noEmit (frontend)
make test           # Run pytest (backend) + vitest (frontend)
make test-backend   # Backend tests only
make test-frontend  # Frontend tests only
make help           # List all targets with descriptions
```

---

## Manual Setup (if Make is unavailable)

```bash
# Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python -m migrations.init_db
uvicorn app.main:app --reload --port 8000

# Frontend (second terminal)
cd frontend
npm install
npm run dev
```

---

## API Reference

### `GET /health`

Liveness probe. Returns HTTP 200 when the API is running.

**Request**

```
GET /health
```

**Response**

```json
{
  "status": "ok",
  "timestamp": "2026-05-14T12:00:00.000000+00:00"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | `string` | Always `"ok"` when the service is healthy |
| `timestamp` | `string` | ISO-8601 UTC timestamp of the response |

**From the browser / Vite proxy:**

```bash
curl http://localhost:5173/api/health
```

**Direct to FastAPI:**

```bash
curl http://localhost:8000/health
```

---

## Project Structure

```
HireIQ/
├── backend/                    # FastAPI application (Python)
│   ├── app/
│   │   ├── main.py             # App factory: FastAPI instance + CORS + routers
│   │   ├── database.py         # SQLAlchemy engine, SessionLocal, Base
│   │   └── routers/
│   │       └── health.py       # GET /health
│   ├── migrations/
│   │   └── init_db.py          # Idempotent DB initialisation
│   ├── requirements.txt
│   └── .env.example
├── frontend/                   # React + TypeScript + Vite
│   ├── src/
│   │   ├── main.tsx            # React entry point
│   │   └── App.tsx             # Root component
│   ├── vite.config.ts          # Proxy: /api/* → localhost:8000
│   └── package.json
├── docs/superpowers/specs/     # Technical specs per milestone
├── Makefile
├── CONSTITUTION.md             # Governing principles — read before changing anything
├── ARCHITECTURE.md             # System design and module map
├── CODE_REVIEW.md              # Review standards and merge criteria
├── UNIT_TESTING.md             # Testing philosophy and patterns
├── DEPLOYMENT.md               # Full deployment guide and runbook
├── SECURITY.md                 # Threat model and security controls
├── VERSION_MANAGEMENT.md       # Versioning and release process
└── AGENTS.md                   # AI agent onboarding — read this first
```

---

## Environment Variables

Documented in `backend/.env.example`. Copy to `backend/.env` to override:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///./hireiq.db` | SQLAlchemy database URL. Path is relative to `backend/`. |

**Never commit `backend/.env`.** It is gitignored. Only `.env.example` is committed.

---

## Running Tests

```bash
# All tests
make test

# Backend only
cd backend && pytest

# Backend with coverage
cd backend && pytest --cov=app --cov-report=term-missing

# Frontend only
cd frontend && npm test

# Frontend with coverage
cd frontend && npm run test:coverage
```

Coverage threshold: **80%** on both backend and frontend. See [`UNIT_TESTING.md`](./UNIT_TESTING.md) for patterns and conventions.

---

## Contributing

Before writing any code, read:

1. **[`AGENTS.md`](./AGENTS.md)** — start here (AI agents and humans alike)
2. **[`CONSTITUTION.md`](./CONSTITUTION.md)** — non-negotiable principles
3. **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** — module boundaries and data flow
4. **[`CODE_REVIEW.md`](./CODE_REVIEW.md)** — what reviewers check and merge criteria

### Branch naming

```
{github-username}/{issue-key}/{description}_{unix-timestamp}

Example: jouneyman-user/hireiq#5/add-candidate-model_1778700000
```

### Commit format

[Conventional Commits](https://www.conventionalcommits.org/):

```
feat(candidates): add list endpoint
fix(db): correct SQLite threading flag
docs: update setup instructions
test(health): add edge case for timestamp
```

### Opening a PR

Complete the author checklist in [`CODE_REVIEW.md`](./CODE_REVIEW.md) before requesting review. All CI checks (lint + tests + coverage) must pass.

---

## Documentation

| Document | Purpose |
|----------|---------|
| [`CONSTITUTION.md`](./CONSTITUTION.md) | Core principles every change must follow |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Tech stack, directory structure, module map, Mermaid diagrams |
| [`CODE_REVIEW.md`](./CODE_REVIEW.md) | Author + reviewer checklists, merge criteria, red flags |
| [`UNIT_TESTING.md`](./UNIT_TESTING.md) | Test patterns for pytest and Vitest, mocking strategy, coverage standards |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Local setup, build process, health checks, common issue runbook |
| [`SECURITY.md`](./SECURITY.md) | Threat model, secrets management, CORS policy, AI-specific risks |
| [`VERSION_MANAGEMENT.md`](./VERSION_MANAGEMENT.md) | SemVer, branching, conventional commits, release process |
| [`AGENTS.md`](./AGENTS.md) | AI agent onboarding — read before writing any code |

---

## Milestone Status

| Milestone | Description | Status |
|-----------|-------------|--------|
| **M1** | Foundation scaffold — FastAPI + SQLite + React monorepo | 🔨 In progress |
| M2+ | Authentication, production infra, Alembic migrations, CI/CD | Planned |

---

*HireIQ — Milestone 1 · 2026*
