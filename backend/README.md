# backend — Red Express API

Node.js + Express, **plain JavaScript with ESM** (`"type": "module"`). Sole owner of the
PostgreSQL database. See [`../ARCHITECTURE.md`](../ARCHITECTURE.md) for the system-level picture.

## Run it

```bash
cp ../.env.example .env      # then keep the [backend] sections
npm run dev --workspace backend
curl http://localhost:4000/health
```

## Layout

```
prisma.config.mjs Prisma CLI config — connection URL lives here, not in schema.prisma
src/
  server.js       binds the port
  app.js          builds the Express app (routers mount here)
  config/prisma.js  shared PrismaClient (pg driver adapter)
  routes/         HTTP routing only
  controllers/    request/response handling, validation entry
  services/       business logic — geo.js, matching.js, smsService, notificationService
  middleware/     requireAuth, requireRole, validation, error handling
  config/         env parsing and typed config objects
  utils/
prisma/           schema.prisma, migrations, seed.js
docs/             database.md, auth.md, profiles.md, search-and-matching.md,
                  notifications.md, crm-lifecycle.md, deploy.md
tests/            Jest unit + integration tests
```

## Conventions

- Validation with **zod**, at the controller boundary.
- One error envelope everywhere: `{ error: { code, message, fields? } }`.
- **Plain PostgreSQL — no PostGIS.** `latitude`/`longitude` are `Float` columns; distance is
  Haversine in JS, after a bounding-box `WHERE` narrows the candidate set.
- Pure, testable functions for geo and matching logic.

## Database

See [`docs/database.md`](docs/database.md) for local Postgres setup, the `db:*` scripts, index
rationale, and seed contents. Quick version:

```bash
npm run db:migrate   # create + apply migrations
npm run db:seed      # sample data (idempotent)
npm run db:studio    # browse the tables
```

This project is on **Prisma 7**: the connection URL lives in `prisma.config.mjs`, not in
`schema.prisma`, and the runtime connects through the `@prisma/adapter-pg` driver adapter.

## Auth

Phone-OTP for app users, email/password for CRM staff, JWT access + refresh tokens, and the
`tokenVersion` force-logout the CRM's "mark donor dead" action depends on. Full reference:
[`docs/auth.md`](docs/auth.md).

```bash
npm run dev        # terminal 1
npm run smoke:auth # terminal 2 — drives the whole auth system end to end
```

## Registration and profiles

Donor and receiver registration, profile reads/edits, availability, and photo upload with a
pluggable storage driver. Full reference: [`docs/profiles.md`](docs/profiles.md).

```bash
npm run dev            # terminal 1
npm run smoke:profiles # terminal 2 — drives registration, uploads and profile edits
```

## Search, requests and matching

`GET /donors/search` (administrative filters and/or a radius), blood requests, and the
matching engine that turns a request into a list of donors to notify. No PostGIS: an indexed
bounding box narrows, then exact Haversine measures. Full reference:
[`docs/search-and-matching.md`](docs/search-and-matching.md).

```bash
npm test                # unit tests for the geo + compatibility logic — no database needed
npm run dev             # terminal 1
npm run smoke:requests  # terminal 2 — search, posting a request, matching, responding
```

## Push notifications

Matched donors are pushed via Expo (`expo-server-sdk`) and every push is mirrored into a
`Notification` row so the in-app inbox survives a lost or undelivered message. Copy is
written to be *heard*: no emoji, no ALL CAPS, no `km` or `O-`. Full reference:
[`docs/notifications.md`](docs/notifications.md).

```bash
npm run smoke:notifications  # devices, inbox, read state, deep-link payload — no phone needed
```

`PUSH_PROVIDER=console` (the default) prints notifications to the API log. Real delivery
needs a physical device running an EAS dev build — **Expo Go cannot receive pushes.**

## CRM endpoints and the donor lifecycle

Staff-only (`/crm/*`): the people finder, the per-request calling worklist, call logs, and
the `ACTIVE → DEAD → (OTP re-login) → ACTIVE` loop that keeps the donor list honest.
Marking a donor unreachable removes them from search and notifications *and* invalidates
every token they hold. Full reference: [`docs/crm-lifecycle.md`](docs/crm-lifecycle.md).

```bash
npm run dev       # terminal 1
npm run smoke:crm # terminal 2 — walks the whole lifecycle, including the forced logout
```

## What exists now

- **Phase 0–1** — folder skeleton, `/health`, full Prisma schema + migration, seed script.
- **Phase 2** — `/auth/otp/request`, `/auth/otp/verify`, `/auth/staff/login`, `/auth/refresh`,
  `/auth/session`; `requireAuth` / `requireRole` / `optionalAuth` middleware; provider-agnostic
  `smsService` (console + MSG91); zod validation.
- **Phase 3** — `/donors/register`, `/donors/me` (+ `/availability`, `/last-donation`),
  `/receivers/register`, `/me`; multipart uploads capped at 2 MB (JPG/PNG/PDF) behind a
  `local`/`s3` storage driver; optional address geocoding that degrades to
  administrative-area matching instead of failing.
- **Phase 4** — `/donors/search` (blood-group compatibility, administrative filters,
  bounding-box + Haversine radius search), `/requests` (create, list, read, close),
  `/requests/:id/matches` and the donor respond endpoint; a matching engine that expands
  5 → 10 → 25 → 50 km until it has enough donors and falls back to district matching when a
  request has no coordinates. Pure logic in `services/geo.js` and `services/matching.js`,
  covered by 52 Jest tests.
- **Phase 5** — `/devices/register`, `/devices`, `/devices/:token`, `/notifications`,
  `/notifications/:id/read`; a provider-agnostic `pushService` (console + Expo) with chunking,
  ticket and receipt handling and automatic removal of unregistered tokens; the matching engine
  now notifies each newly matched donor, and accepting a request notifies the requester.
  Screen-reader-first notification copy in `services/pushMessages.js`, covered by Jest.
- **Phase 6** — `/crm/stats`, `/crm/users/search`, `/crm/users/:userId`,
  `/crm/donors/nearby`, `/crm/call-logs` (read + write), `/crm/donors/:userId/mark-dead`
  (STAFF) and `/crm/donors/:userId/reactivate` (ADMIN only), all behind one router-level
  role gate; a new `AuditLog` table recording sensitive actions with the staff member's
  note and the machine-readable before/after, written in the same transaction as the
  status change.

Total: 77 unit tests, plus five smoke scripts covering auth, profiles, requests,
notifications and the CRM. `mobile/` scaffolds next, in Phase 7.
