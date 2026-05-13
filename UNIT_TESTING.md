# Unit Testing Standards

> Testing philosophy, patterns, and requirements for HireIQ. Read alongside [`CONSTITUTION.md`](./CONSTITUTION.md).

---

## Testing Philosophy

Tests in HireIQ exist to **prove that the system does what it says it does** — not to hit a coverage number, and not to document implementation details.

The guiding principles:

1. **Tests catch regressions** — a new feature should not break existing behaviour. Tests are the safety net.
2. **Tests document behaviour** — a well-named test is the most honest spec: `test_health_returns_200_with_timestamp_in_iso8601_format`
3. **Tests give confidence to refactor** — if refactoring requires rewriting tests, the tests were testing implementation, not behaviour
4. **Tests should be fast** — unit tests run in milliseconds. If a test is slow, it probably doesn't belong in the unit test suite

**Testing pyramid for HireIQ:**

```
        /\
       /  \     E2E Tests (Playwright — future milestone)
      /    \    Few, slow, high confidence, high cost
     /------\
    /        \  Integration Tests (future milestone)
   /          \ Test FastAPI routes with a real DB; test component + API together
  /------------\
 /              \ Unit Tests (primary focus)
/________________\ Many, fast, isolated, cheap to maintain
```

At M1, the focus is **unit tests** for backend logic and component tests for the frontend. Integration tests and E2E tests are deferred.

---

## Tech Stack

### Backend

| Tool | Purpose |
|------|---------|
| **pytest** | Test runner and assertion framework |
| **pytest-asyncio** | Async test support for FastAPI routes |
| **httpx** | HTTP client for testing FastAPI with `TestClient` or async client |
| **FastAPI TestClient** | In-process HTTP testing (from `fastapi.testclient`) |
| **SQLite in-memory** | Test database — `sqlite:///:memory:` in test config |

Install: `pip install pytest pytest-asyncio httpx`

### Frontend

| Tool | Purpose |
|------|---------|
| **Vitest** | Test runner (Vite-native; shares `vite.config.ts`) |
| **@testing-library/react** | Component testing utilities |
| **@testing-library/user-event** | Simulates real user interactions |
| **jsdom** | Browser environment simulation |
| **msw (Mock Service Worker)** | API mocking at the network layer |

Install: `npm install -D vitest @testing-library/react @testing-library/user-event jsdom msw`

---

## Directory Structure

### Backend

```
backend/
├── app/
│   └── routers/
│       └── health.py
└── tests/                      # Mirror of app/ structure
    ├── __init__.py
    ├── conftest.py              # Shared fixtures: test app, test DB, test client
    ├── test_health.py           # Tests for app/routers/health.py
    └── test_database.py        # Tests for app/database.py
```

**Naming:** Test files mirror the module they test. `app/routers/health.py` → `tests/test_health.py`.

### Frontend

```
frontend/
├── src/
│   ├── App.tsx
│   └── __tests__/              # Colocated test directory
│       └── App.test.tsx        # Tests for App.tsx
└── vitest.config.ts            # Vitest config (or extend vite.config.ts)
```

**Naming:** Test files are colocated in `__tests__/` next to the source they test. `App.tsx` → `__tests__/App.test.tsx`.

---

## Test Anatomy

### Backend — annotated example

```python
# tests/test_health.py

import pytest
from fastapi.testclient import TestClient
from app.main import app

# ─── Arrange ─────────────────────────────────────────────────────────────────

@pytest.fixture
def client():
    """Synchronous TestClient for making requests to the FastAPI app."""
    return TestClient(app)


# ─── Tests ───────────────────────────────────────────────────────────────────

class TestHealthEndpoint:
    """All tests for GET /health."""

    def test_returns_200_ok(self, client):
        """The health endpoint must return HTTP 200 — no exceptions."""
        response = client.get("/health")
        assert response.status_code == 200

    def test_response_contains_status_ok(self, client):
        """The status field must be the string 'ok'."""
        response = client.get("/health")
        assert response.json()["status"] == "ok"

    def test_response_contains_iso8601_timestamp(self, client):
        """The timestamp field must be present and parseable as ISO-8601."""
        from datetime import datetime
        response = client.get("/health")
        timestamp = response.json()["timestamp"]
        # Should not raise — this is the assertion
        datetime.fromisoformat(timestamp)

    def test_response_content_type_is_json(self, client):
        """Response must declare JSON content type."""
        response = client.get("/health")
        assert "application/json" in response.headers["content-type"]
```

### Frontend — annotated example

```tsx
// src/__tests__/App.test.tsx

import { render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import App from '../App'

// ─── Arrange — mock server ────────────────────────────────────────────────────

const server = setupServer(
  http.get('/api/health', () => {
    return HttpResponse.json({ status: 'ok', timestamp: '2026-05-13T00:00:00Z' })
  })
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('App', () => {
  it('shows loading state initially', () => {
    render(<App />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('displays ok status when API responds successfully', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('ok')).toBeInTheDocument()
    })
  })

  it('displays unreachable when API fails', async () => {
    server.use(
      http.get('/api/health', () => HttpResponse.error())
    )
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('unreachable')).toBeInTheDocument()
    })
  })
})
```

---

## What to Test

### Unit tests — write these

| Scenario | Backend | Frontend |
|----------|---------|---------|
| Happy path | Response shape, status code | Component renders expected content |
| Error responses | 4xx/5xx status codes | Error states, fallback UI |
| Input edge cases | Empty strings, None, boundary values | Empty props, undefined data |
| Data transformation | Serialization, type coercion | Props to rendered output |

### Integration tests — defer to M2

- FastAPI routes with a real (in-memory) SQLite database
- Frontend components that interact with multiple APIs

### E2E tests — defer to a future milestone

- Full browser flows (Playwright): login → create job → view listing

---

## What Not to Test

Do not write unit tests for:

- **FastAPI internals** — the framework is already tested; don't test that `@router.get` registers a route
- **SQLAlchemy internals** — don't test that `create_all` creates tables; it does
- **React rendering mechanics** — don't test that `useState` updates state
- **Configuration loading** — `python-dotenv` is tested; your `os.getenv` call is not the interesting part
- **Third-party library behaviour** — test your code's use of the library, not the library itself

---

## Mocking Strategy

### Backend — mock at the database boundary

Use `TestClient` for route tests. For tests that need database isolation, override the `get_db` dependency with an in-memory SQLite database:

```python
# tests/conftest.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base, get_db
from app.main import app

TEST_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(autouse=True)
def test_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def client(test_db):
    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()
    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
```

### Frontend — mock at the network boundary

Use **Mock Service Worker (msw)** to intercept `fetch` calls at the network layer. Do not mock `fetch` directly or mock component props to avoid calling fetch — this tests the wrong thing.

```typescript
// src/__tests__/setup.ts — registered in vitest.config.ts
import '@testing-library/jest-dom'
```

---

## Coverage Standards

- **Backend:** 80% line coverage minimum, enforced in CI
- **Frontend:** 80% line coverage minimum, enforced in CI
- **Coverage is a floor, not a target.** 80% with meaningful tests is better than 100% with tests that only check that functions return something

Run coverage locally:

```bash
# Backend
cd backend && pytest --cov=app --cov-report=term-missing

# Frontend
cd frontend && npm test -- --coverage
```

---

## Running Tests

### Backend

```bash
cd backend

# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=term-missing

# Run a specific file
pytest tests/test_health.py

# Run a specific test
pytest tests/test_health.py::TestHealthEndpoint::test_returns_200_ok

# Watch mode (requires pytest-watch)
ptw
```

### Frontend

```bash
cd frontend

# Run all tests (once)
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage

# Run specific file
npx vitest run src/__tests__/App.test.tsx
```

### Via Makefile

```bash
# Run backend tests
make test-backend

# Run frontend tests
make test-frontend

# Run all tests
make test
```

> Note: Makefile `test` targets are part of the M1 implementation. Add them to the Makefile when setting up the scaffold.

---

## Writing Good Tests

### Test naming

Tests must read as English sentences describing the expected behaviour:

```python
# Good — behaviour is clear
def test_health_returns_200_when_database_is_reachable():
def test_health_returns_503_when_database_is_unavailable():

# Bad — doesn't say what "works" means
def test_health_works():
def test_health():
```

### Arrange-Act-Assert

Every test follows three distinct phases:

```python
def test_health_returns_iso8601_timestamp(client):
    # Arrange — nothing to set up; TestClient and fixture handle it

    # Act
    response = client.get("/health")

    # Assert
    timestamp = response.json()["timestamp"]
    datetime.fromisoformat(timestamp)  # raises ValueError if not ISO-8601
```

### Test isolation

- Each test must be independent — the order of test execution must not matter
- Use fixtures (`conftest.py`) for shared setup; never use module-level globals that mutate
- Database state is reset between tests (see `test_db` fixture above)

### Avoiding flakiness

- No `time.sleep()` in tests — use mocking for time-dependent code
- No randomness without a seed
- No external network calls — mock at the boundary (MSW for frontend, `dependency_overrides` for backend)
- No tests that depend on file system state outside of fixtures

---

## Testing AI-Generated Code

AI-generated code requires extra vigilance because:

- AI tends to write tests that pass trivially against the implementation it just wrote
- AI may hallucinate library APIs that don't exist in the installed version
- AI may skip edge cases that seem obvious to the model but are actually important

**Protocol for AI-generated code:**

1. **Run the tests first, before trusting the implementation** — if the tests were generated alongside the code, verify they test real behaviour
2. **Ask for edge-case tests separately** — prompt: *"Write adversarial tests for [feature] that try to break it with empty inputs, boundary values, and error conditions"*
3. **Verify test-to-implementation alignment** — temporarily break the implementation and confirm the tests fail
4. **Preferred TDD pattern with AI:**
   ```
   "Write the tests first for [feature]. Do not implement yet.
    Cover: happy path, empty/null inputs, error conditions, boundary values.
    Follow patterns in tests/conftest.py. I will review before implementation."
   ```

---

## Common Pitfalls

| Pitfall | What it looks like | What to do instead |
|---------|-------------------|-------------------|
| Testing implementation, not behaviour | `assert router.routes[0].path == "/health"` | `assert client.get("/health").status_code == 200` |
| Over-mocking | Mocking the module under test | Mock only external dependencies |
| Shared mutable state | `db = []` at module level, mutated across tests | Use fixtures with fresh state per test |
| Asserting only presence, not content | `assert "timestamp" in response.json()` | Also assert the value is a valid ISO-8601 string |
| One mega-test | `def test_everything():` with 50 assertions | One test per observable behaviour |
| Ignoring async boundaries | Calling `async def` without `await` in tests | Use `pytest-asyncio` and `async def test_...` |

---

*Last updated: 2026-05-13 — M1 foundation scaffold.*
