# Database

Plain PostgreSQL via Prisma. **No PostGIS. No extensions of any kind.**

Geography is two ordinary `Float` columns, `latitude` and `longitude`. Distance is never
computed in SQL — it is computed in JavaScript with the Haversine formula. Radius searches
narrow with an indexed bounding-box `WHERE` first, then run exact Haversine over the survivors
(Phase 4). This is why the deployment target is "any managed Postgres" with no extension
requirements at all.

## Running Postgres locally with Docker

The standard `postgres` image is all you need.

### Option A — Docker Desktop GUI

1. Start **Docker Desktop** and wait for the whale icon to say *Engine running*. The CLI cannot
   talk to the daemon until it does.
2. Go to the **Images** tab → **Search images** (or the search bar at the top) → type
   `postgres` → pull the **`postgres`** official image, tag `16`.
3. Once pulled, click **Run** on the image and open **Optional settings**:
   - **Container name**: `redexpress-db`
   - **Host port**: `5433` (maps to the container's 5432 — see the port note below)
   - **Environment variables**:
     | Variable | Value |
     |---|---|
     | `POSTGRES_USER` | `redexpress` |
     | `POSTGRES_PASSWORD` | `redexpress` |
     | `POSTGRES_DB` | `redexpress` |
4. Click **Run**. The container appears under **Containers**, status *Running*.

### Option B — command line

Same thing, once Docker Desktop is running:

```bash
docker run --name redexpress-db \
  -e POSTGRES_USER=redexpress \
  -e POSTGRES_PASSWORD=redexpress \
  -e POSTGRES_DB=redexpress \
  -p 5433:5432 \
  -v redexpress-pgdata:/var/lib/postgresql/data \
  -d postgres:16
```

PowerShell needs backticks instead of `\` for line continuation, or just put it on one line.

**This is the setup currently in use.** The container publishes on host port **5433**, not 5432,
because this machine also runs a native PostgreSQL 18 service that already owns 5432. Postgres
inside the container still listens on 5432 — only the host-side mapping differs.

The `-v` flag keeps your data in a named volume, so `docker rm` on the container does not wipe
the database.

Day to day:

```bash
docker start redexpress-db     # after a reboot
docker stop  redexpress-db
docker logs  redexpress-db     # if a connection is refused
```

### Port 5432 already in use?

If you already run PostgreSQL natively on this machine (check with
`Get-Service postgresql*` on Windows), port 5432 is taken. Either stop that service, or publish
the container on a different host port — `-p 5433:5432` — and set the port in `DATABASE_URL`
to `5433`.

You can also just use the native install instead of Docker. Create the role and database once:

```sql
CREATE ROLE redexpress WITH LOGIN PASSWORD 'redexpress';
CREATE DATABASE redexpress OWNER redexpress;
```

Nothing in this project cares which one it talks to.

## Connection string

`backend/.env`:

```
DATABASE_URL=postgresql://redexpress:redexpress@localhost:5433/redexpress?schema=public
```

Prisma 7 no longer accepts `url` inside `schema.prisma`. The connection string is read by
[`../prisma.config.mjs`](../prisma.config.mjs) for CLI commands (migrate, studio, seed) and by
[`../src/config/prisma.js`](../src/config/prisma.js) for the running app, which passes it to the
`@prisma/adapter-pg` driver adapter.

## Everyday commands

Run from the repo root, or drop `--workspace backend` if you are already inside `backend/`.

| Command | What it does |
|---|---|
| `npm run db:migrate --workspace backend` | Create and apply a migration from schema changes (development). |
| `npm run db:seed --workspace backend` | Load the development dataset. Safe to re-run. |
| `npm run db:studio --workspace backend` | Open Prisma Studio, a browser UI over the tables. |
| `npm run db:generate --workspace backend` | Regenerate Prisma Client after editing the schema. |
| `npm run db:reset --workspace backend` | **Drops and recreates the database**, re-applies migrations, re-seeds. |
| `npm run db:deploy --workspace backend` | Apply existing migrations without generating new ones (production). |

First-time setup, in order:

```bash
npm install
# start Postgres (above), then:
cp .env.example backend/.env        # set DATABASE_URL
npm run db:migrate --workspace backend
npm run db:seed --workspace backend
```

## What the seed creates

[`../prisma/seed.js`](../prisma/seed.js) is idempotent — every row is upserted on a natural key
(email or phone), so re-running converges rather than duplicating.

- **1 ADMIN** — `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env`.
- **2 STAFF** — `staff1@redexpress.local`, `staff2@redexpress.local`, using `SEED_STAFF_PASSWORD`.
- **30 DONORs** — spread across eight Odisha districts (Khordha, Cuttack, Puri, Ganjam,
  Sundargarh, Sambalpur, Balasore, Angul), phones `+919000000001` upward, all eight blood
  groups cycled. Coordinates are scattered deterministically within about 6 km of each district
  centre, so radius expansion has realistic distances to work with.
- **3 RECEIVERs** — phones `+919100000001` upward.

Two donors are deliberately **not** ACTIVE — one `DEAD` and one `BLOCKED` — so that search
exclusion (Phase 4) and the CRM lifecycle (Phase 6) have data to exercise immediately. About a
quarter of donors have `isAvailable = false` to exercise the `availableOnly` filter.

Seeded passwords are placeholders. Change `SEED_ADMIN_PASSWORD` and `SEED_STAFF_PASSWORD`
before this runs anywhere other than a development machine.

## Indexes

Beyond primary and unique keys, the schema declares btree indexes on:

| Table | Index | Why |
|---|---|---|
| `User` | `status` | Every donor query filters out non-ACTIVE users. |
| `User` | `(role, status)` | CRM user search filters by both. |
| `DonorProfile` | `bloodGroup` | The first filter of essentially every search. |
| `DonorProfile` | `(state, district, city)` | The administrative-area search path. |
| `DonorProfile` | `(latitude, longitude)` | **The bounding-box pre-filter.** This is what keeps radius search fast without PostGIS. |
| `DonorProfile` | `(bloodGroup, isAvailable)` | The common "available donors of group X" case. |
| `BloodRequest` | `status`, `bloodGroup`, `(state, district, city)`, `(latitude, longitude)`, `(status, createdAt)` | Request listing and the CRM worklist. |
| `RequestMatch` | `(requestId, distanceKm)` | Nearest-first match listing. |
| `RequestMatch` | `(donorUserId, response)` | A donor's pending matches. |
| `Notification` | `(userId, createdAt)`, `(userId, readAt)` | Inbox listing and unread counts. |
| `OtpCode` | `(phone, createdAt)` | Latest-code lookup and the per-phone rate limit. |
| `CallLog` | `(donorUserId, createdAt)`, `(staffId, createdAt)`, `requestId` | Call history per donor, per staff, per request. |

`RequestMatch` also has a unique constraint on `(requestId, donorUserId)` so a donor cannot be
matched to the same request twice.

## Schema notes

- **`User.tokenVersion`** is the force-logout mechanism. Every access token embeds the version
  it was minted under; `requireAuth` rejects a token whose claim no longer matches the row.
  Incrementing it invalidates every outstanding token for that user without a blocklist. See
  `docs/crm-lifecycle.md` (Phase 6).
- **`phone`, `email` and `passwordHash` are all nullable on `User`** because one table holds two
  populations: app users have a phone and no password, staff have an email and a password.
- **`OtpCode.codeHash`** stores only a bcrypt hash. The plaintext code exists solely in the SMS.
- **`latitude`/`longitude` are nullable** on both `DonorProfile` and `BloodRequest` — a user may
  decline location permission, in which case matching falls back to administrative area.
- **Cascades**: deleting a user removes their profile, matches, notifications, device tokens and
  the calls made *to* them. `CallLog.requestId` is `SetNull` so deleting a request does not erase
  the record that a call happened.
- **`Gender` is an enum** (`MALE`, `FEMALE`, `OTHER`). The original spec left the type open;
  an enum matches the dropdown in the registration mockup and keeps the values validated.
