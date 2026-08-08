# Red Express — Architecture

> This document is the shared mental model for the whole system. Read it first in any
> new working session before changing code. If a decision here turns out to be wrong,
> update this file in the same change that fixes the code.

## 1. Purpose

Red Express helps patients find nearby blood donors during emergencies.

Two audiences, two clients, one API:

- **Patients / attendants (receivers)** post a blood request and see nearby donors.
- **Donors** get notified when someone near them needs their blood group, and accept or decline.
- **Staff / admins** work the phones from a CRM: search donors, call them, log outcomes, and
  retire unreachable numbers.

**Hard requirement: the mobile app must be fully usable by blind users via screen readers**
(TalkBack on Android, VoiceOver on iOS). Accessibility is a build-time constraint on every
component, not a later audit. Practically this means: every interactive element carries a role
and a label, focus lands on the screen heading at mount, async state changes are announced via
live regions, nothing is communicated by color or position alone, touch targets are at least
48dp, and OS font scaling is never disabled.

## 2. System shape

```
                    ┌────────────────────────┐
   Donor / Receiver │  mobile/  (Expo, RN)   │
   phone + OTP auth │  accessibility-first   │
                    └───────────┬────────────┘
                                │ REST + JWT (access 15m / refresh 30d)
                                │
                    ┌───────────▼────────────┐        ┌──────────────────┐
                    │  backend/  Express API │───────▶│ Expo Push API    │
                    │  Prisma + PostgreSQL   │        └──────────────────┘
                    │  matching engine       │───────▶┌──────────────────┐
                    └───────────▲────────────┘        │ SMS provider     │
                                │                     │ (MSG91/console)  │
                                │ REST + JWT in       └──────────────────┘
                                │ httpOnly cookies
                    ┌───────────┴────────────┐
   Staff / Admin    │  crm/  (Next.js App    │
   email + password │  Router, plain JS)     │
                    └────────────────────────┘
```

Everything shares one PostgreSQL database, owned exclusively by `backend/`. Neither client
talks to the database directly.

## 3. Workspaces

| Workspace  | Stack | Role |
|---|---|---|
| `backend/` | Node.js + Express, **plain JS with ESM** (`"type": "module"`) | REST API, auth, matching, notifications. Sole owner of the database. |
| `mobile/`  | React Native + Expo (Expo Router), plain JS | Donor + receiver app. Accessibility-first. |
| `crm/`     | Next.js App Router, **plain JavaScript, no TypeScript** | Staff/admin dashboard. |

Managed with **npm workspaces** from the repo root. No TypeScript anywhere in this project.

### backend/

REST API layered as `routes/ → controllers/ → services/`, with `middleware/` for auth,
validation, and error handling. Request bodies are validated with **zod**. Every endpoint
returns the same error envelope:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "…", "fields": { "phone": "…" } } }
```

**Persistence: plain PostgreSQL via Prisma. No PostGIS, no extensions.** Geography is two
plain `Float` columns (`latitude`, `longitude`). Distance is computed in application code
with the Haversine formula, never in the database. Proximity queries run in two stages:

1. A **bounding-box** `WHERE latitude BETWEEN … AND longitude BETWEEN …` pre-filter, which
   uses a btree index on `(latitude, longitude)` and cheaply discards most rows.
2. Exact **Haversine** distance in JS over the survivors, dropping anything past the radius
   and sorting nearest-first.

This keeps the deployment target to "any managed Postgres" with no extension requirements.

A note on the Prisma version: this project is on **Prisma 7**, which removed `url` from the
`datasource` block and connects through a driver adapter. So the connection string lives in
`backend/prisma.config.mjs` (CLI) and `backend/src/config/prisma.js` (runtime, via
`@prisma/adapter-pg`), not in `schema.prisma`. The config file is `.mjs` rather than the Prisma
default `.ts` because this project is plain JavaScript throughout, and the schema uses the
`prisma-client-js` generator so the generated client is plain JS in `node_modules` — the newer
`prisma-client` generator emits TypeScript source, which would force a build step.

**Auth** is JWT-based with two entry paths:

- App users authenticate by **phone OTP** — a 6-digit code, only its bcrypt hash stored,
  5-minute expiry, capped attempts, rate limited per phone. Sent through a provider-agnostic
  `smsService` (MSG91 in prod, console in dev, chosen by `SMS_PROVIDER`).
- Staff/admin authenticate by **email + password** (bcrypt).

Access tokens carry `userId`, `role`, and `tokenVersion`. See §6 for why `tokenVersion` matters.

**Matching engine**: a service (not merely a route handler) that, on request creation, finds
ACTIVE and available donors of a compatible blood group inside an expanding radius
(5 → 10 → 25 → 50 km, until at least ~20 candidates), writes `RequestMatch` rows, and pushes
each matched donor a notification. An administrative-area fallback (state/district/city match)
sits behind a config flag for regions where coordinates are sparse.

**Notifications** go out via `expo-server-sdk` (chunked, receipts checked, invalid tokens
dropped) and are mirrored into a `Notification` row for the in-app inbox. Push copy is written
for screen readers: no emoji carrying meaning, no ALL-CAPS words — "Urgent", not "URGENT".

### mobile/

Expo Router app. A shared, accessible component kit (`AppButton`, `AppTextInput`, `AppSelect`,
`ScreenHeader`, `Card`, `LiveMessage`) is the accessibility baseline — screens inherit it
rather than each re-solving labels and focus. Tokens live in `expo-secure-store`. The API
client clears tokens and routes to Login on a `401` from a token-version mismatch, which is
exactly what a donor marked DEAD experiences.

Navigation mirrors the product mockups:

```
Landing → Login | Register
Register → choose type (Become a Donor | Find Blood) → phone → OTP → form → home
```

### crm/

Next.js App Router in plain JavaScript, Tailwind for styling, sidebar + topbar admin layout.
The staff JWT is exchanged **server-side** in a route handler and kept in an **httpOnly
cookie**, so it is never readable from client JS. `proxy.js` — Next 16's replacement for
`middleware.js` — protects `/dashboard/*` and silently refreshes the access token so a long
calling session is never interrupted by a 15-minute expiry. Every render then re-checks the
session against the backend rather than decoding the cookie locally, which is what makes a
revoked `tokenVersion` take effect on the next click. ADMIN-only actions (donor reactivation)
are hidden and disabled for STAFF, and enforced again on the server.

## 4. Core entities

| Entity | Purpose |
|---|---|
| `User` | Everyone. `role` ∈ DONOR, RECEIVER, STAFF, ADMIN. `status` ∈ ACTIVE, DEAD, BLOCKED. Holds `tokenVersion`, plus the coarse `state`/`district`/`city`/`latitude`/`longitude` a RECEIVER registers with (null for donors). |
| `DonorProfile` | 1:1 with a donor User: blood group, gender, DOB, last donation, availability, address parts, `latitude`/`longitude` — the single source of truth for a donor's position. |
| `BloodRequest` | A patient's need: blood group, units, hospital, urgency, location, status, expiry. |
| `RequestMatch` | Join of a request to a candidate donor, with `distanceKm` and the donor's PENDING/ACCEPTED/DECLINED response. Unique per (request, donor). |
| `Notification` | In-app inbox row mirroring each push. |
| `OtpCode` | Phone, bcrypt hash of the code, expiry, attempt count, consumption time. |
| `CallLog` | A staff call attempt on a donor: outcome PICKED_UP, NO_ANSWER, WRONG_NUMBER, MARKED_DEAD. |
| `DeviceToken` | A user's Expo push token, unique per token, with platform. |
| `AuditLog` | Who did what to whose account: `actor`, `action`, `targetUser`, the staff member's `note`, and `metadata` holding the machine-readable before/after. Written in the same transaction as the change it describes. |

Full field-level definitions live in [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma) —
that schema is the source of truth, this table is the map. Index choices and the local database
setup are documented in [`backend/docs/database.md`](backend/docs/database.md).

## 5. Roles and status

**Roles.** `DONOR` and `RECEIVER` are app users, authenticated by phone OTP. `STAFF` and
`ADMIN` are CRM users, authenticated by email and password. A single person can hold only one
role; a donor who needs blood posts a request under their own donor account.

**Status.**

- `ACTIVE` — normal. Appears in search and receives notifications.
- `DEAD` — staff could not reach them (wrong number, permanently unanswered). Hidden from
  search and notifications. Recoverable by the user themselves (see §6).
- `BLOCKED` — administratively barred. Rejected at the auth middleware. Not self-recoverable.

## 6. The DEAD-donor lifecycle (why `tokenVersion` exists)

This is the distinctive mechanic of the system, so it is worth stating precisely.

Phone numbers go stale. Staff calling a donor who has changed numbers need a way to take that
donor out of circulation without deleting them, while leaving a path back if the person is
still reachable through the app.

```
  ACTIVE ──[staff: mark-dead]──▶ DEAD ──[user reopens app, verifies OTP]──▶ ACTIVE
     ▲                                                                        │
     └──────────────────[admin: manual reactivate]────────────────────────────┘
```

Marking a donor dead does five things atomically:

1. `User.status = DEAD`
2. `User.tokenVersion += 1`
3. `DonorProfile.isAvailable = false`
4. Writes a `CallLog` with outcome `MARKED_DEAD`
5. Writes an `AuditLog` row with the staff member's note and the previous status,
   token version and availability

Step 2 is the force-logout. Every access token embeds the `tokenVersion` it was minted under;
`requireAuth` compares that claim against the user's current `tokenVersion` in the database and
rejects with `401` on any mismatch. Incrementing the counter therefore invalidates every
outstanding token for that user at once — no token blocklist, no session table. The mobile
client sees the `401`, clears secure storage, and drops the user on the Login screen.

If the donor is in fact reachable, they log back in via OTP; successful verification flips
`DEAD → ACTIVE` and they reappear in search. If they never come back, they stay dead and stop
wasting staff call time. `BLOCKED` deliberately does **not** get this escape hatch.

Re-logging in does not switch `isAvailable` back on: proving the number reaches them is not
the same as being free to donate, so the donor turns it back on themselves. The admin
override restores the availability they had *before* staff switched them off, read back out
of the audit row. Neither path restores an old session — the token bump is never rolled
back. The whole loop, endpoint by endpoint, is in
[`backend/docs/crm-lifecycle.md`](backend/docs/crm-lifecycle.md).

## 7. Environment and configuration

All configuration is environment variables — no secrets in the repo. `/.env.example` at the
root is the master list of every variable across all three apps, with comments and placeholder
values. Each app reads its own file:

| App | File it loads | Notes |
|---|---|---|
| backend | `backend/.env` | Loaded via `dotenv`. |
| mobile | `mobile/.env` | Only `EXPO_PUBLIC_*` vars reach the app bundle — **and they are public**. Never put a secret there. |
| crm | `crm/.env.local` | Only `NEXT_PUBLIC_*` vars reach the browser. Server-only vars stay unprefixed. |

Copy the relevant section out of the root `.env.example` into each app's file. See the root
`README.md` for setup steps.

## 8. Conventions

- **Plain JavaScript everywhere.** ESM in the backend (`"type": "module"`, `import`/`export`).
  No TypeScript in any workspace, including the CRM.
- **Business logic in services, not controllers.** Geo math (`services/geo.js`) and matching
  (`services/matching.js`) are pure functions so they can be unit-tested without a database.
- **Consistent error envelope** across every endpoint (see §3).
- **No PII leakage across roles.** The app's donor search returns approximate distance, never a
  donor's full address; exact contact details are for STAFF/ADMIN in the CRM. This is
  health-adjacent personal data — treat it that way.
- **Accessible copy.** User-facing strings (including push notifications) are written to be
  read aloud: sentence case, no meaning-bearing emoji, no ALL-CAPS.

## 9. Build order

The system is built in phases; each assumes the previous ones exist.

| Phase | Scope |
|---|---|
| 0 | Monorepo, workspaces, env conventions, this document. |
| 1 | Prisma schema, migrations, seed data. |
| 2 | Auth: phone OTP, staff login, JWT, `tokenVersion` middleware. |
| 3 | Registration and profile APIs, file uploads. |
| 4 | Donor search, blood requests, matching engine (Haversine). |
| 5 | Expo push notifications and the in-app inbox. |
| 6 | CRM APIs: staff search, call logs, mark-dead / reactivate, stats. |
| 7 | Mobile shell: theme, navigation, accessible component kit. |
| 8 | Mobile auth + OTP flow. |
| 9 | Mobile registration and profile screens. |
| 10 | Mobile search, request posting, push handling and respond flow. |
| 11 | Accessibility hardening pass and optional voice guidance. |
| 12 | CRM shell and staff auth. |
| 13 | CRM dashboard, search, detail views. |
| 14 | CRM call worklist and dead-donor marking. |
| 15 | Testing, security hardening, deployment docs. |

Current state: **Phases 0–12 complete.**

- `backend/` is feature-complete: the Prisma schema and seed data, the full auth system
  ([`docs/auth.md`](backend/docs/auth.md)), registration/profile APIs with file uploads
  ([`docs/profiles.md`](backend/docs/profiles.md)), donor search, blood requests and the
  matching engine ([`docs/search-and-matching.md`](backend/docs/search-and-matching.md)), Expo
  push notifications with an in-app inbox
  ([`docs/notifications.md`](backend/docs/notifications.md)), and the staff-only CRM endpoints
  including the donor lifecycle loop
  ([`docs/crm-lifecycle.md`](backend/docs/crm-lifecycle.md)).
- `mobile/` runs the whole donor and receiver journey on the accessible component kit, and has
  been through the Phase 11 hardening pass
  ([`mobile/docs/accessibility.md`](mobile/docs/accessibility.md)).
- `crm/` has its shell and staff sign-in ([`crm/README.md`](crm/README.md)). The dashboard
  itself is empty until Phase 13.

Remaining: Phases 13–15 — the CRM data pages, the calling worklist and mark-dead action, then
security hardening and deployment.
