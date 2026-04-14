# Doghouse

> A local-first security operations workspace for turning raw penetration testing output into a searchable, structured project record.

Doghouse is a single-user security data hub built for consultants, internal red teams, and operators who need a practical place to organize scan results, domain notes, host findings, loot, and tool output during an engagement.

It is intentionally local-only. The backend binds to `127.0.0.1` by default, API access is protected with a generated local token, and the frontend bootstraps against the local backend only.

---

## What Doghouse Is For

Doghouse helps you:

- ingest scanner output from tools like `Nmap` and `Nessus`
- upload ad hoc tool output from common offensive tooling such as `Nikto`, `Nuclei`, and `NetExec`
- document domain-level findings for internal penetration tests
- track hosts, services, findings, loot, notes, and artifacts in one place
- export structured reports, including a findings report CSV

The goal is not collaboration. The goal is fast, local, operator-friendly organization.

---

## Core Capabilities

### Ingestion

- `Nmap` XML ingestion
- `Nessus` XML ingestion
- generic tool-output uploads (`.txt`, `.json`, `.xml`)
- multi-file tool-output upload from the dashboard
- host-level tool-output upload directly from Host Detail

### Data Management

- Projects
- Domain-level documentation
- Hosts
- Services
- Findings
- Loot / credentials
- Notes
- Artifacts
- Ingest jobs

### Reporting

- JSON / CSV export for assets, services, findings, and instances
- Findings Report CSV with:
  - Plugin ID
  - Risk
  - Host
  - Protocol
  - Port
  - Name
  - Synopsis
  - Description
  - Solution
  - See Also
  - Plugin Output

---

## Architecture

### Backend

- `FastAPI`
- `SQLAlchemy 2.0` async
- `asyncpg`
- `Alembic`
- built-in async ingestion runner

### Frontend

- `React`
- `TypeScript`
- `Vite`
- `TanStack Query`

### Database

- `PostgreSQL 16` via `docker compose`

### Storage

- DB for normalized records
- filesystem for artifacts
- content-addressed artifact storage under `data/artifacts/`

---

## Security Model

Doghouse is designed for local-only use.

- Backend is intended to bind only to `127.0.0.1`
- Non-local bind is refused unless `DEV_ALLOW_NONLOCAL=true`
- API requests require `X-API-Token`
- Token is generated on first run and stored in:
  - `data/config.json`
- Frontend gets the token through:
  - `GET /bootstrap`
- `/bootstrap` is limited to localhost and same-origin access

This is not a multi-user application and should not be deployed as a public web service.

---

## Repository Layout

```text
Doghouse/
├─ backend/
├─ frontend/
├─ docker-compose.yml
├─ Makefile
└─ README.MD
```

---

## Requirements

Install these on your workstation before setup:

- `Python 3.11+`
- `Node.js 20+`
- `npm`
- `Docker`
- `Docker Compose`

---

## Quick Start

### 1. Clone the repository

```bash
git clone <your-repo-url> Doghouse
cd Doghouse
```

### 2. Start PostgreSQL

```bash
docker compose up -d
```

### 3. Set up the backend

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment:

```bash
# Windows
.venv\Scripts\activate

# Linux / macOS
source .venv/bin/activate
```

Install backend dependencies:

```bash
pip install -e .[dev]
```

Create the environment file:

```bash
# Windows
copy .env.example .env

# Linux / macOS
cp .env.example .env
```

### 4. Run database migrations

```bash
alembic upgrade head
```

### 5. Start the backend

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 6. Set up the frontend

Open a second terminal:

```bash
cd frontend
npm install
```

### 7. Start the frontend

```bash
npm run dev
```

### 8. Open the application

```text
http://127.0.0.1:5173
```

---

## Production-Style Local Run

If you want FastAPI to serve the built frontend:

### 1. Build the frontend

```bash
cd frontend
npm install
npm run build
```

### 2. Run the backend

```bash
cd ../backend
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Then browse to:

```text
http://127.0.0.1:8000
```

---

## One-Line Make Targets

The project includes a `Makefile` for the common workflow:

```bash
make up-db
make migrate
make dev-backend
make dev-frontend
make test
make build
```

What they do:

- `make up-db` -> starts PostgreSQL
- `make migrate` -> applies Alembic migrations
- `make dev-backend` -> runs FastAPI locally
- `make dev-frontend` -> runs Vite dev server
- `make test` -> runs backend tests
- `make build` -> builds the frontend

---

## Environment Variables

`backend/.env.example`

```env
APP_ENV=dev
DATABASE_URL=postgresql+asyncpg://doghouse:doghouse@127.0.0.1:5432/doghouse
HOST=127.0.0.1
PORT=8000
DEV_ALLOW_NONLOCAL=false
DATA_DIR=../data
FRONTEND_DIST_DIR=../frontend/dist
DEV_FRONTEND_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
LOG_LEVEL=INFO
```

Important:

- keep `HOST=127.0.0.1` for normal operation
- do not expose this service publicly

---

## Typical Workflow

### Start an engagement

1. Create a project
2. Add a domain if you are performing internal testing
3. Import `Nmap` or `Nessus`
4. Upload supporting tool output from dashboard or Host Detail
5. Review:
   - Domain
   - Hosts
   - Services
   - Findings
   - Loot
6. Add manual findings and manual hosts where needed
7. Export a report

### Common use cases

- Internal penetration test documentation
- External test scan normalization
- Host-by-host finding triage
- Credential and artifact organization
- Local reporting workspace during an engagement

---

## Reporting

### Findings Report

Available from the Export page as CSV.

The report includes Nessus plugin IDs when present. For custom/manual findings:

- `Plugin ID` is exported as `custom`
- minimum expected fields are:
  - Risk
  - Host
  - Protocol
  - Port
  - Name
  - Description

---

## Tool Output Handling

Generic tool output uploads support:

- `.txt`
- `.json`
- `.xml`

Doghouse attempts to infer:

- tool name
- target IP
- additional discovered IPs

If a file suggests a target IP that is not already present in the project, Doghouse lets you:

- confirm the new host
- map the upload to an existing host
- cancel the upload

This is intended to reduce bad host correlation when tools report extra infrastructure such as load balancers or related endpoints.

---

## Data Locations

Doghouse writes data locally under `data/`.

Important paths:

- API token:
  - `data/config.json`
- uploads:
  - `data/uploads/`
- artifacts:
  - `data/artifacts/<2>/<2>/<sha256>`

Artifacts are gzip-stored and content-addressed by SHA-256.

---

## Testing and Quality

### Run tests

```bash
cd backend
pytest -q
```

### Run lint checks

```bash
cd backend
ruff check .
black --check .
```

---

## Resetting to a Clean Local State

If you want to wipe the local environment and start fresh:

### Stop running processes

```bash
pkill -f "uvicorn app.main:app" || true
pkill -f "vite" || true
```

### Stop Docker services and remove the database volume

```bash
docker compose down --volumes --remove-orphans
```

### Remove local data

```bash
rm -rf data
```

If you are on Windows, remove the `data` directory manually or with PowerShell:

```powershell
Remove-Item -Recurse -Force .\data
```

Then rerun the setup steps from the top.

---

## Operational Notes

- Host Detail and Domain pages are intended to be living engagement notes, not just scan viewers.
- Manual records are supported:
  - manual findings
  - manual hosts
  - domain findings
- Hosts are sorted by actionable vulnerability count, excluding informational findings.

---

## Why “Doghouse”?

Because offensive operations rarely fail due to lack of data.
They fail because data ends up everywhere.

Doghouse gives the engagement somewhere disciplined to live.

---

## Status

This project is actively evolving. The current implementation is best suited for:

- local development
- operator workflows
- internal-use reporting and documentation

If you are extending it, start with:

- `backend/app/`
- `frontend/src/pages/`
- `backend/alembic/versions/`

---

## License

Add your preferred license here.
