# Security

> Threat model, security controls, and security checklist for HireIQ. Review this document before any change that touches authentication, data handling, CORS configuration, infrastructure, or AI tooling.

---

## Security Philosophy

HireIQ's security posture is **defence in depth with explicit trust boundaries**:

- Trust nothing from outside the service boundary without validation
- Be explicit about what is allowed (allowlist over denylist)
- Fail safely — on error, deny access rather than grant it
- Secrets never touch source control, logs, or error responses

At M1, the attack surface is intentionally minimal: a local development environment with no authentication, no external integrations, and no sensitive data. Security controls are established at M1 so they become habits before sensitive data enters the system at M2+.

---

## Threat Model

### Assets being protected

| Asset | Sensitivity | Notes |
|-------|------------|-------|
| Candidate PII (M2+) | High | Names, contact info, resumes — not in scope at M1 |
| Job data (M2+) | Medium | Internal hiring pipeline information |
| API integrity | Medium | Preventing unauthorized API calls or data manipulation |
| Source code | Medium | Proprietary business logic |
| Development environment | Low | No production data at M1 |

### Likely threat actors

- **External attackers** — unlikely to target a development-only M1 system; will matter at M2+ when the system is networked
- **Dependency supply chain** — malicious or vulnerable packages in `requirements.txt` or `package.json`
- **Insecure defaults** — developer habits (wildcard CORS, plaintext secrets) that persist into production

### Attack surface at M1

- HTTP API on localhost:8000 (not internet-exposed)
- SQLite file on local filesystem
- Developer machines (code, credentials, git history)
- Python and Node dependencies

---

## Authentication & Authorization

**M1 status:** No authentication is implemented. The `/health` endpoint is a public liveness probe — by design.

**When authentication is introduced (M2+):**

- Use an established library — do not implement custom authentication
- Recommended: `fastapi-users` or `python-jose` for JWT-based auth
- All protected routes must go through a dependency-injected auth guard
- Never use AI-generated authentication logic without thorough security review
- Session tokens must be stored in httpOnly cookies — never in `localStorage` or `sessionStorage`

**Authorization rule (for all future milestones):** LLM output must never be used directly in an access control decision. Any AI-generated content that reaches an auth check must first pass through server-side validation.

---

## Input Validation

FastAPI provides automatic request validation via Pydantic. All incoming data must go through Pydantic models — no raw `request.body()` parsing that bypasses validation.

**Pattern to follow:**

```python
from pydantic import BaseModel, Field

class JobCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(..., max_length=10000)
    # Not: title: str  # (no constraints)
```

**Never:**

```python
# ❌ Raw dict access without validation
data = await request.json()
title = data["title"]  # no type check, no length check, no sanitization
```

---

## Data Classification

| Data type | Classification | Storage | Logging allowed? |
|-----------|---------------|---------|-----------------|
| Candidate PII | Sensitive | Encrypted at rest (M2+) | No |
| Internal job data | Internal | SQLite (M1) | No in production |
| API tokens / credentials | Secret | Environment variables only | No — never |
| Health check data | Public | N/A (generated per request) | Yes |
| Error messages | Internal | Logs only | Yes (sanitized) |

---

## Secrets Management

### Rules (non-negotiable)

1. **No secrets in source code** — no API keys, database passwords, JWT secrets, or credentials in `.py`, `.ts`, `.tsx`, `.json`, or any other committed file
2. **No secrets in `CLAUDE.md` or `.claude/`** — AI tool configuration files are in version control; they must contain no credentials
3. **No secrets in commit messages or PR descriptions**
4. **No secrets in logs** — sanitize all log output before it reaches a log aggregator
5. **`.env` is gitignored** — always. Never run `git add backend/.env`

### How secrets are managed

```
backend/.env.example    → Committed. Documents variable names and acceptable formats.
                          Contains no real values. Safe to share publicly.

backend/.env            → Gitignored. Created per-developer from .env.example.
                          Contains real values. Never committed.
```

### Environment variable access pattern

```python
# ✅ Correct
import os
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./hireiq.db")

# ❌ Wrong — hardcoded value
DATABASE_URL = "sqlite:///./path/that/only/works/on/my/machine"
```

---

## Dependency Security

### Python

All dependencies are pinned with `>=` version constraints in `requirements.txt`. Run security audits:

```bash
pip install pip-audit
cd backend && pip-audit
```

**Known considerations at M1:**

| Package | Version | Notes |
|---------|---------|-------|
| `fastapi>=0.111.0` | Latest stable | Actively maintained; check for updates monthly |
| `uvicorn[standard]>=0.29.0` | Latest stable | |
| `sqlalchemy>=2.0.0` | 2.x required | 1.x is EOL |
| `python-dotenv>=1.0.0` | Latest stable | |

### Node.js

```bash
cd frontend && npm audit
npm audit fix   # for non-breaking fixes
```

Run `npm audit` before every release. Do not ignore HIGH or CRITICAL findings.

### Automated updates

Dependabot or Renovate configuration is recommended for M2+. At M1, run `pip-audit` and `npm audit` manually before each release.

---

## Vulnerability Checklist

Review before any change to routes, middleware, data models, or authentication:

### General

- [ ] **No SQL injection** — all database queries use SQLAlchemy ORM or parameterized statements; no f-strings in SQL
- [ ] **No command injection** — no `subprocess` calls with user input; no `eval()`
- [ ] **No path traversal** — file paths constructed from user input must be validated and sandboxed
- [ ] **No insecure deserialization** — no `pickle.loads()` on untrusted data

### Web-specific

- [ ] **CORS** — `allow_origins` is an explicit allowlist, never `["*"]`; configured in `app/main.py`
- [ ] **XSS** — React escapes output by default; never use `dangerouslySetInnerHTML` without sanitization
- [ ] **CSRF** — not applicable at M1 (no cookies, no state-changing browser-initiated requests); add protection when auth is introduced
- [ ] **Clickjacking** — add `X-Frame-Options: DENY` header when the app is deployed publicly

### Data handling

- [ ] **Sensitive data in logs** — no passwords, tokens, SSNs, or email addresses in log statements
- [ ] **Sensitive data in error responses** — error messages must not include stack traces, internal paths, or database error details in production
- [ ] **PII in transit** — all HTTP traffic must use HTTPS in staging/production (not applicable at M1 local)

### SSRF

Not applicable at M1 (no outbound HTTP calls from the backend). When external API calls are introduced:
- [ ] Validate and allowlist all external URLs before making outbound requests
- [ ] Do not expose raw URLs from user input to `requests.get()` or `httpx.get()`

---

## AI-Specific Security Risks

Using Claude Code and other AI tools introduces security risks that are separate from traditional application security:

### Prompt injection

**Risk:** User-supplied data passed to an LLM can contain instructions that manipulate the model's output.

**Controls:**
- Never pass raw user input directly to an LLM prompt without sanitization and instruction separation
- Never use LLM output in authentication, authorization, or access control decisions
- Treat all LLM output as untrusted data that must be validated before use

### Secrets in AI configuration files

**Risk:** `CLAUDE.md`, `.claude/settings.json`, and `.mcp.json` are committed to the repository. Any credentials placed there are permanently in git history.

**Controls:**
- `CLAUDE.md` and all files in `.claude/` must never contain API keys, tokens, passwords, or connection strings
- Use environment variables for any credentials that AI tools need

### MCP server trust

**Risk:** MCP (Model Context Protocol) servers have access to tools and data. A compromised or malicious MCP server can exfiltrate data or execute destructive operations.

**Controls:**
- Only connect to MCP servers you control or have audited
- Treat all data returned by MCP tools as untrusted
- Review `.mcp.json` carefully before adding new servers

### Subagent permission scope creep

**Risk:** AI subagents with broad tool permissions can read, write, or execute beyond their intended scope.

**Controls:**
- Always define explicit `tools` allowlists in subagent definitions
- Read-only agents must not have `Write`, `Edit`, or `Bash` permissions
- Principle of least privilege applies to AI agents exactly as it does to service accounts

### Claude Code hook injection

**Risk:** Hooks in `.claude/settings.json` execute shell commands. If hook configuration is user-influenced, it can execute arbitrary code.

**Controls:**
- Review every hook definition in `.claude/settings.json`
- Hooks must only reference pre-approved scripts with fixed paths
- No dynamic command construction in hook definitions

### AI-generated code in security-sensitive paths

**Risk:** AI models can produce plausible-looking but incorrect authentication or authorization logic.

**Controls:**
- All AI-generated code in auth flows requires dedicated security review before merge
- Run the full security checklist above against all AI-generated code
- AI-generated code that passes a security check but was not written by a security-aware human still needs human sign-off

---

## Security Review Triggers

The following changes always require a dedicated security review (not just a standard code review):

1. Any change to CORS configuration
2. Introduction of authentication or authorization
3. Addition of new external API integrations (outbound HTTP from backend)
4. Addition of file upload or download functionality
5. Changes to session, token, or credential handling
6. Addition of new MCP servers or Claude Code tool permissions
7. Changes that handle PII (candidate names, emails, resumes)
8. Changes to `requirements.txt` or `package.json` (dependency supply chain)

---

## Incident Response

If a security vulnerability is discovered:

1. **Do not open a public GitHub issue** — use private disclosure
2. **Contact the maintainer directly** via the email in the git commit history
3. **Describe the vulnerability** without including a working exploit in the initial report
4. **Expect a response within 48 hours**

---

## Compliance Considerations

HireIQ will handle candidate PII at M2+. The following regulations are likely applicable once the system goes to production:

| Regulation | Applicable when | Key requirement |
|-----------|----------------|----------------|
| GDPR | Candidates in the EU | Right to erasure, data minimization, consent |
| CCPA | Candidates in California | Right to know, right to delete |
| General data protection | Any production deployment | Encryption at rest, audit logs, access controls |

At M1, no PII is processed and no compliance obligations are active. Design decisions at M2+ must account for these requirements.

---

*Last updated: 2026-05-13 — M1 foundation scaffold.*
