.PHONY: dev test lint ingest golden docker-up vercel-reqs

dev:
	@echo "Starting development servers..."
	@echo "Backend: uvicorn app.main:app --reload --port 8000"
	@echo "Frontend: npm run dev"
	@echo "Run each in its respective directory or terminal."

test:
	@echo "Running backend tests..."
	cd backend && pytest
	@echo "Running frontend tests..."
	cd frontend && npm run test

lint:
	@echo "Linting backend..."
	cd backend && ruff check app tests
	cd backend && ruff format --check app tests
	cd backend && mypy app tests
	@echo "Linting frontend..."
	cd frontend && npm run lint
	cd frontend && npm run typecheck

ingest:
	@echo "Ingesting Elexon data..."
	cd backend && python -m app.ingest.cli --from 2025-12-01 --to 2026-01-31 --out data/snapshot

.PHONY: dev test lint ingest golden openapi docker-up vercel-reqs

golden:
	@echo "Regenerating API golden contract files..."
	python scripts/generate_golden.py

openapi:
	@echo "Exporting OpenAPI JSON schema..."
	python scripts/export_openapi.py

docker-up:
	@echo "not implemented yet"

vercel-reqs:
	@echo "not implemented yet"
