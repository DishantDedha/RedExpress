# Deploying Red Express

Three deployables, one database, no exotic infrastructure:

| Piece | Runs on | Needs |
|---|---|---|
| `backend/` | any Node 20+ host (Render, Fly, Railway, a VM, a container) | **plain** managed PostgreSQL — no PostGIS, no extensions |
| `crm/` | any Next.js host (Vercel, or Node behind a reverse proxy) | reachable backend URL |
| `mobile/` | EAS Build → App Store / Play Store | a **dev build**, not Expo Go, for push and dictation |

Read [`../ARCHITECTURE.md`](../ARCHITECTURE.md) first if you have not. This document assumes you
know what `tokenVersion` is for.

> **This system holds health-adjacent personal data** — phone numbers, home addresses, blood
> groups and coordinates, collected from people during someone else's medical emergency. Every
> "do not skip this" below is there because skipping it exposes that data or the people in it.

---

## 1. The database

Any managed PostgreSQL 14+ will do. Nothing needs superuser, no extension is installed, and
`CREATE EXTENSION` appears nowhere in the migrations — proximity search is a bounding-box
`WHERE` on two `Float` columns plus Haversine in application code
([`backend/src/services/geo.js`](../backend/src/services/geo.js)). That is a deliberate
constraint, not a limitation to work around later: it means the database can be the cheapest
managed Postgres the host offers, and can be swapped without a data migration.

```bash
# From the repo root, with DATABASE_URL pointing at production.
npm run db:deploy --workspace backend
```

`db:deploy` (`prisma migrate deploy`) applies committed migrations and never generates new ones
or prompts. **Never run `db:migrate` or `db:reset` against production** — the first can author a
migration from a drifted schema, the second drops everything.

### Creating the first administrator

```bash
npm run create:admin --workspace backend
# or unattended:
ADMIN_EMAIL=ops@example.org ADMIN_NAME="Ops Lead" ADMIN_PASSWORD='…' \
  npm run create:admin --workspace backend
```

**Do not run `db:seed` in production.** It inserts thirty fictional donors with real-looking
Odisha coordinates and phone numbers. Staff would find them in search and ring them during an
emergency. `create:admin` is the production path: one ADMIN account, nothing else, and further
staff are added from the dashboard.

The script is re-runnable and is also the recovery path for a lost admin password — it resets
the hash and bumps `tokenVersion`, killing any session the previous holder had.

### Backups

Whatever the host offers, turned on, with restores actually tested. The tables that hurt to lose
are `User`, `DonorProfile` and `CallLog`: the first two are the donor registry, and the third is
the evidence for every `DEAD` status a staff member set.

---

## 2. Backend

### Environment

[`../.env.example`](../.env.example) is the master list. The `[backend]` sections go into the
host's environment (not a committed file). `config/env.js` validates at boot, so a missing
secret crashes the process at start rather than at the first login.

**Must be set, and wrong-by-default if you forget:**

| Variable | Why it matters in production |
|---|---|
| `NODE_ENV=production` | Suppresses error details in responses and turns on HSTS. Without it, error messages leak internals. |
| `DATABASE_URL` | Include `?sslmode=require` for a managed database. |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | **Two different** long random strings. Sharing one makes a leaked access token good for thirty days. |
| `CORS_ORIGINS` | The CRM origin, exactly. Empty in production means *reject every cross-origin browser request* — it does not mean "allow all". |
| `TRUST_PROXY` | `1` behind one proxy, `2` behind two (CDN → platform router). Unset behind a proxy means **every caller shares one rate-limit bucket**. Too high means a client can spoof its IP for a fresh one. |
| `API_BASE_URL` | The public HTTPS URL. Uploaded photo URLs are built from it. |
| `SMS_PROVIDER=msg91` + `MSG91_*` | `console` in production means codes are printed to the log and no one receives one. |
| `PUSH_PROVIDER=expo` | `console` means nobody is ever alerted. |
| `STORAGE_DRIVER=s3` + `S3_*` | Local disk does not survive a redeploy on an ephemeral filesystem — every profile photo disappears. |
| `BCRYPT_ROUNDS=12` | 10 is the development default. |

Leave `RATE_LIMIT_ENABLED` alone. It exists for the integration tests. Setting it to `false` in
production removes the OTP-flood, password-guessing and directory-scraping ceilings at once.

### Run

```bash
npm ci --omit=dev --workspace backend   # installs the backend's deps only
npm run db:generate --workspace backend # Prisma client for this platform
npm run db:deploy   --workspace backend
npm start           --workspace backend
```

### Health checks

| Path | Question | Point it at |
|---|---|---|
| `GET /health` | Is the process alive? | the **liveness** probe |
| `GET /health/ready` | Can it reach the database? | the **readiness** probe / load balancer |

They are deliberately different. A liveness probe that fails when the database blips gets the
container killed and restarted, which does not fix a database. Readiness returns `503` in that
case, which takes the instance out of rotation and puts it back when Postgres returns.

Neither is authenticated — a probe cannot hold a token — so neither returns a version string,
a connection detail or a row count.

### Rate limiting across more than one instance

The limiters store counters in process memory, which is correct for one instance and wrong for
several: with N instances the effective ceilings are N times what is configured. If you scale
out, move the store to Redis (`rate-limit-redis`) in
[`backend/src/middleware/rateLimit.js`](../backend/src/middleware/rateLimit.js). The per-phone
OTP limit is database-backed and is already correct at any instance count.

### Uploads

With `STORAGE_DRIVER=s3` the API writes to the bucket and hands out URLs; it never serves the
files. Make the bucket (or its CDN) readable, not listable — a listable bucket of profile photos
is a donor directory.

---

## 3. CRM

### Environment

| Variable | Notes |
|---|---|
| `BACKEND_API_BASE_URL` | Server-side only — deliberately unprefixed so it never reaches the browser bundle. |
| `NEXT_PUBLIC_APP_URL` | The CRM's own public origin. Must appear in the backend's `CORS_ORIGINS`. |
| `CRM_SESSION_SECRET` | Signs the CSRF token. **Required in production** — the app throws rather than sign with a fallback. |
| `CRM_COOKIE_SECURE=true` | Behind HTTPS. Driven by env rather than `NODE_ENV` so a pilot on an internal http host does not hit a login loop. |
| `CRM_ALLOWED_ORIGINS` | Only when a proxy or CDN sits in front, so the host Next sees differs from the one the browser used. Hostnames, no scheme. Never a wildcard. |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | **Required when running more than one instance.** Without it each instance generates its own and Server Actions fail intermittently on whichever instance did not render the page. |

```bash
npm ci --workspace crm
npm run build --workspace crm
npm start     --workspace crm
```

### What protects a staff session

Worth knowing before changing any of it:

- **Tokens live in `httpOnly` cookies**, set by a route handler that does the exchange
  server-side. They never exist in client JavaScript, so an XSS cannot read the credential that
  unlocks every donor's phone number and address.
- **Server Actions** (call log, mark dead, reactivate) get Next's built-in Origin-vs-Host CSRF
  check, plus a role check inside each action — the backend's `requireRole` is still the
  enforcement.
- **Route handlers** (`/api/auth/login`, `/api/auth/logout`) get none of that, so they carry an
  explicit check: Origin-vs-Host, plus a signed double-submit token
  ([`crm/lib/csrf.js`](../crm/lib/csrf.js)). Without it a page anywhere could sign a staff
  member into *an attacker's* account and every donor they then marked unreachable would be
  audited under the wrong name.
- **`X-Frame-Options: DENY`**, because clickjacking a "Mark as unreachable" button is exactly
  the attack that header exists for.

---

## 4. Mobile

### Why a dev build, not Expo Go

Push notifications do not work in Expo Go on Android (SDK 53+), and the optional dictation
feature needs a config plugin. Both require an EAS **development build** on a real device.
The app degrades honestly without them — requests still appear in the inbox, and every field can
be typed — but you cannot test the alert path in Expo Go.

```bash
npx eas-cli build --profile development --platform android   # for testing
npx eas-cli build --profile production  --platform all       # for the stores
```

### Environment

Only `EXPO_PUBLIC_*` variables reach the app, and **everything that does is readable by anyone
who installs it.** No secret ever goes here.

| Variable | Notes |
|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | The public HTTPS API URL. `localhost` means the phone itself. |
| `EXPO_PUBLIC_PROJECT_ID` | From `app.json` / EAS. Without it no push token can be minted. |
| `EXPO_PUBLIC_PRIVACY_POLICY_URL`, `EXPO_PUBLIC_TERMS_URL` | Linked from the privacy screen and the registration consent checkbox. Leave blank and the app says the document is not in this build rather than opening a 404. |
| `EXPO_PUBLIC_SUPPORT_EMAIL` | The address on the privacy screen for data deletion requests. |
| `EXPO_PUBLIC_ENABLE_VOICE_INPUT` | `false` unless the dev build includes the voice plugin. |

Tokens are stored in `expo-secure-store` only — Keychain on iOS, Keystore-backed on Android —
never `AsyncStorage`, which is a plain unencrypted file. All console output goes through
[`mobile/services/logger.js`](../mobile/services/logger.js), which is a hard no-op outside
`__DEV__` and redacts tokens, phone numbers and addresses even inside it.

### Store listings

Both stores require a privacy declaration. The app collects: phone number, name, blood group,
approximate and precise location, and a photo. It shares none of it with third parties. The
in-app privacy screen (`/privacy`) is the plain-language version of the same statement.

---

## 5. Rotating secrets

### JWT secrets

Rotating either secret invalidates every token signed with it. There is no dual-secret
verification window, and that is a deliberate simplification: rotation is rare, and the
alternative is code that accepts tokens signed by a key you were trying to retire.

**What actually happens when you rotate:**

- **Access secret** — every app user's next request 401s. `mobile/services/apiClient.js` tries
  the refresh once, that fails too, and the user is sent to sign in. A donor re-verifies by OTP
  in about twenty seconds. Staff retype a password.
- **Refresh secret** — same outcome, reached slightly later.

So: rotate both together, during a quiet hour, and expect everyone to sign in again. Nobody
loses data; `tokenVersion` is untouched and no account status changes.

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # once per secret
```

Do this immediately if a secret is ever exposed — a leaked access secret lets anyone mint a
token for any `userId` and read every donor record in the system.

### SMS provider keys

MSG91 keys can be rotated with no user impact: generate the new key, set `MSG91_AUTH_KEY`,
redeploy, then revoke the old one. A code already in flight is unaffected — delivery has already
happened, and verification only reads the local `OtpCode` row.

Verify afterwards with a real request to `/auth/otp/request` and a phone you hold. A silently
broken SMS key is invisible from the server side: the API returns 200 and nobody ever receives
a code.

### Expo access token

Needed only if the Expo project has push security enabled. Rotate in the Expo dashboard, update
`EXPO_ACCESS_TOKEN`, redeploy. Device tokens are unaffected — they identify installations, not
the sender.

### CRM secrets

Rotating `CRM_SESSION_SECRET` invalidates outstanding CSRF tokens; anyone mid-login gets "your
page has expired, reload and try again". Rotating `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` requires
a simultaneous redeploy of every instance.

---

## 6. Pre-launch checklist

Data protection:

- [ ] `NODE_ENV=production` on the backend — error responses carry no internals
- [ ] `CORS_ORIGINS` names the CRM origin and nothing else
- [ ] `TRUST_PROXY` matches the actual number of proxies
- [ ] `RATE_LIMIT_ENABLED` is not `false`
- [ ] Two different JWT secrets, neither of them the placeholder
- [ ] `CRM_SESSION_SECRET` set; `CRM_COOKIE_SECURE=true`
- [ ] HTTPS everywhere — an OTP over plain http is an OTP anyone on the network has
- [ ] Storage bucket readable but **not listable**

Correctness:

- [ ] `npm run test:all --workspace backend` passes against a migrated database
- [ ] `GET /health/ready` returns 200 from the deployed instance
- [ ] `SMS_PROVIDER=msg91` and a real code arrives on a real phone
- [ ] `PUSH_PROVIDER=expo` and an alert arrives on a dev build
- [ ] The first ADMIN was created with `create:admin`, **not** `db:seed`
- [ ] No seeded fictional donors in the production database:
      `SELECT count(*) FROM "User" WHERE phone LIKE '+9198765%';` returns 0

Then walk [`README.md`](README.md#what-to-test-manually) — including the screen-reader smoke
test, which is the one thing no automated check in this repo covers.
