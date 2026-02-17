# Doghouse (Lair-lite, local-only)

Single-user security data hub for Nmap + Nessus ingestion, normalization, search, and export.

## 1) Start Postgres

```bash
docker compose up -d
```

## 2) Backend setup

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
# source .venv/bin/activate

pip install -e .[dev]
copy .env.example .env
```

## 3) Run migrations

```bash
alembic upgrade head
```

## 4) Run backend (localhost only)

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

The app refuses non-local bind host unless:
`DEV_ALLOW_NONLOCAL=true`.

## 5) Frontend dev OR production build

```bash
cd ../frontend
npm install
npm run dev
```

Or production build:
```bash
npm run build
```
Then start backend again; it serves `frontend/dist`.

## Quality commands

```bash
cd backend
ruff check .
black --check .
pytest -q
```

## Data storage notes

- Artifacts are content-addressed under `./data/artifacts/<2>/<2>/<sha256>`.
- Uploads are placed in `./data/uploads/<job_id>/`.
- Config/token is in `./data/config.json` (0600 best-effort).
- Evidence snippets are truncated to 64KB.