.PHONY: up-db migrate dev-backend dev-frontend test build

up-db:
	docker compose up -d

migrate:
	cd backend && alembic upgrade head

dev-backend:
	cd backend && uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

dev-frontend:
	cd frontend && npm run dev

test:
	cd backend && pytest -q

build:
	cd frontend && npm run build