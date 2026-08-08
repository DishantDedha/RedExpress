# Red Express

A blood-donation platform that helps patients find nearby blood donors during emergencies —
and that a blind user can operate end to end with a screen reader.

Three workspaces in one npm-workspaces monorepo:

| Folder | What it is | Stack |
|---|---|---|
| [`backend/`](backend/) | REST API, auth, donor matching, push notifications | Node.js + Express, plain JS (ESM), Prisma + PostgreSQL |
| [`mobile/`](mobile/) | Donor + receiver app, accessibility-first | React Native + Expo (Expo Router), plain JS |
| [`crm/`](crm/) | Staff/admin dashboard: search, call, mark unreachable | Next.js App Router, plain JS (no TypeScript) |

**Read [`ARCHITECTURE.md`](ARCHITECTURE.md) first.** It describes the data model, the auth
design, the no-PostGIS geo approach, and the ACTIVE → DEAD → re-login donor lifecycle that the
CRM and the app both depend on.

## Prerequisites

- Node.js 20 or newer (`node -v`)
- npm 9 or newer — this repo uses npm workspaces
- Docker, for local PostgreSQL
- For mobile work: the Expo Go app, or an Expo dev build on a real device (push notifications
  do not work in a simulator)

## Local setup

### 1. Install dependencies

From the repo root — one install covers all three workspaces:

```bash
npm install
```

### 2. Start PostgreSQL

Plain Postgres. **No PostGIS and no extensions are needed** — coordinates are ordinary `Float`
columns and distance is computed in application code.

```bash
docker run --name redexpress-db \
  -e POSTGRES_USER=redexpress \
  -e POSTGRES_PASSWORD=redexpress \
  -e POSTGRES_DB=redexpress \
  -p 5433:5432 \
  -v redexpress-pgdata:/var/lib/postgresql/data \
  -d postgres:16
```

On Windows PowerShell, use backticks instead of `\` for line continuation, or put it on one line.

Host port **5433** is deliberate — it avoids clashing with a native PostgreSQL install on 5432.
If 5432 is free on your machine you can use `-p 5432:5432` instead; just match `DATABASE_URL`.

Stop and start it later with `docker stop redexpress-db` / `docker start redexpress-db`.

### 3. Configure environment variables

[`.env.example`](.env.example) at the root is the master list of every variable all three apps
use. It is a reference, not a loaded file — copy the section you need into each app:

```bash
cp .env.example backend/.env      # keep the [backend] sections
cp .env.example mobile/.env       # keep the [mobile] section
cp .env.example crm/.env.local    # keep the [crm] section
```

Then fill in the placeholders. At minimum, generate real JWT secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Leave `SMS_PROVIDER=console` in development — OTP codes print to the API log instead of costing
money.

### 4. Run the API

```bash
npm run dev:backend
curl http://localhost:4000/health
```

### 4b. Create the tables and load sample data

```bash
npm run db:migrate --workspace backend   # create + apply the migration
npm run db:seed --workspace backend      # 1 admin, 2 staff, 30 donors, 3 receivers
npm run db:studio --workspace backend    # optional: browse the data
```

Full database documentation — Docker Desktop walkthrough, every `db:*` script, the index
rationale, and what the seed creates — is in
[`backend/docs/database.md`](backend/docs/database.md).

### 5. Run the CRM and the app

```bash
npm run dev:crm       # http://localhost:3000
npm run dev:mobile    # Expo dev server, then scan the QR code
```

Sign in to the CRM with a seeded staff account — `admin@redexpress.local` or
`staff1@redexpress.local`, using the passwords in `backend/.env`.

## Current state

**All phases (0–15) are done.** The backend is complete and hardened, the mobile app runs the
whole donor journey and has been through its accessibility pass, the CRM runs the full calling
and dead-donor workflow, and the system is ready to deploy.

Start here before running or shipping anything:

- [`docs/README.md`](docs/README.md) — the run order, the test commands, and the **manual test
  checklist** including the screen-reader smoke test of the donor journey.
- [`docs/deploy.md`](docs/deploy.md) — production deployment, the env checklist, and how to
  rotate JWT secrets and SMS keys.

- `backend/` — **feature-complete (Phases 1–6).** Full Prisma schema and a re-runnable seed
  script; phone-OTP and staff auth; donor/receiver registration and profiles with photo upload;
  donor search, blood requests and the matching engine; Expo push notifications; and the CRM
  endpoints including the mark-dead / re-login lifecycle. See
  [`backend/README.md`](backend/README.md).
- `mobile/` — **the full app loop, hardened (Phases 7–11).** Expo Router app on a
  WCAG-verified theme and the accessible component kit; OTP sign-in; donor and receiver
  registration and the profile screen; donor search, posting a blood request, push
  notifications with deep-linked Accept/Decline, and the in-app alert inbox. Phase 11 added
  optional voice guidance, big-text and high-contrast preferences, and dictation behind a
  feature flag — see [`mobile/docs/accessibility.md`](mobile/docs/accessibility.md) for the
  audit and the manual screen-reader test steps. See [`mobile/README.md`](mobile/README.md).
- `crm/` — **the full staff dashboard (Phases 12–14).** Next.js 16 App Router in plain JS:
  admin layout, staff sign-in with the tokens held in httpOnly cookies, silent token refresh in
  `proxy.js`, stats and user/donor/request search, and the calling worklist with click-to-call,
  call outcomes, the mark-unreachable action and the ADMIN-only reactivate. See
  [`crm/README.md`](crm/README.md).
- **Hardening (Phase 15)** — rate limiting, helmet, a locked-down CORS allow-list and
  centralised error handling on the API; `libphonenumber-js` phone validation; a PII rule that
  gives app users a rounded distance and staff the address; a liveness/readiness split;
  integration tests over a real database; a redacting no-op-in-production logger and a privacy
  and permissions screen on the app; and CSRF protection on the CRM's route handlers.

The full phase plan is at the end of [`ARCHITECTURE.md`](ARCHITECTURE.md).

## House rules

- **Plain JavaScript everywhere**, including the CRM. No TypeScript.
- **No PostGIS.** Bounding-box `WHERE` first, then Haversine in JS.
- **Accessibility is a build constraint**, not a final audit — a blind donor is the primary
  user of the app.
- This is health-adjacent personal data. Phone numbers, addresses, and coordinates only ever go
  to the roles entitled to see them.
