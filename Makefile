.PHONY: install dev migrate lint test test-backend test-frontend help

help:           ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install:        ## Install all dependencies (backend pip + frontend npm)
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

migrate:        ## Initialise / migrate the SQLite database (idempotent)
	cd backend && python -m migrations.init_db

dev:            ## Start backend (port 8000) and frontend (port 5173) concurrently
	cd backend && uvicorn app.main:app --reload --port 8000 &
	cd frontend && npm run dev

lint:           ## Lint backend (ruff) and frontend (eslint + tsc)
	cd backend && ruff check .
	cd frontend && npm run lint

test:           ## Run all tests (backend pytest + frontend vitest)
	cd backend && pytest
	cd frontend && npm test

test-backend:   ## Run backend tests only (pytest)
	cd backend && pytest

test-frontend:  ## Run frontend tests only (vitest)
	cd frontend && npm test
