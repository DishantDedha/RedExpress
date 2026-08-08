# Authentication (Phase 2)

Red Express has two audiences with two different sign-in methods and one shared token
system.

| Audience | Roles | Credential | Entry point |
| --- | --- | --- | --- |
| App users | `DONOR`, `RECEIVER` | Phone + 6-digit OTP | `POST /auth/otp/request` → `POST /auth/otp/verify` |
| CRM users | `STAFF`, `ADMIN` | Email + password (bcrypt) | `POST /auth/staff/login` |

Both paths end at the same place: an **access token** (15 min) plus a **refresh token**
(30 days), both signed JWTs.

---

## The token-version force-logout mechanism

This is the piece the CRM depends on in Phase 6, so it is worth reading in full.

`User.tokenVersion` is an integer that starts at `0`. Every JWT this API issues carries
the user's `tokenVersion` at the moment of issue as a claim:

```jsonc
// access token payload
{ "sub": "<userId>", "role": "DONOR", "tokenVersion": 0, "typ": "access", "iss": "red-express" }
```

`requireAuth` ([src/middleware/auth.js](../src/middleware/auth.js)) does three things on
every protected request:

1. verifies the signature and expiry,
2. **loads the user row and compares `payload.tokenVersion` with `user.tokenVersion`**,
3. rejects `BLOCKED` users.

A mismatch is a `401` with code `TOKEN_VERSION_MISMATCH`.

So **incrementing `User.tokenVersion` instantly invalidates every token that user holds** —
on the phone, on the tablet, everywhere — without a token blocklist or a session table.

```
staff clicks "Mark as unreachable"
        │
        ├─ User.status      = DEAD
        └─ User.tokenVersion += 1        ← every existing JWT is now stale
                │
                ▼
donor's app makes its next API call
        │
        └─ 401 { error: { code: "TOKEN_VERSION_MISMATCH" } }
                │
                ▼
app clears expo-secure-store and routes to the OTP screen
                │
                ▼
donor verifies by SMS → status flips DEAD → ACTIVE, tokens re-issued at the new version
```

### Why re-login clears DEAD

`DEAD` means "staff phoned this donor and could not reach them". A successful OTP verify
is proof the number is live and the person is holding the phone — exactly the thing staff
were trying to establish. So `completePhoneLogin` flips `DEAD → ACTIVE`.

`tokenVersion` is deliberately **not** touched on that revival. The bump already happened
when staff marked them dead; bumping again would invalidate the tokens being handed out in
that same response. `BLOCKED` is different — it is administrative, self-recovery is not
allowed, and blocked numbers are refused before an OTP is even sent.

### The cost of instant revocation

`requireAuth` reads the user row on every request. That is one indexed primary-key lookup,
and it is what buys revocation that takes effect on the donor's very next call instead of
up to 15 minutes later. If that read ever becomes a bottleneck, cache
`userId → tokenVersion` rather than skipping the check.

---

## Endpoints

### `POST /auth/otp/request`

```jsonc
// request
{ "phone": "9876543210" }

// 200
{
  "phone": "+919876543210",        // normalised, echo it back in the verify call
  "maskedPhone": "*********3210",
  "expiresAt": "2026-08-05T16:00:53.057Z",
  "expiresInSeconds": 300,
  "message": "Verification code sent to *********3210.",
  "devCode": "157773"              // only when SMS_PROVIDER=console and NODE_ENV≠production
}
```

- Phone numbers are normalised to E.164 ([src/utils/phone.js](../src/utils/phone.js)), so
  `9876543210`, `09876543210`, `+91 98765 43210` are all one account.
- Only the **bcrypt hash** of the code is stored (`OtpCode.codeHash`).
- Requesting a code retires any previous live code for that number, so "Resend" makes the
  older SMS useless.
- Rate limit: `OTP_REQUESTS_PER_WINDOW` (3) per phone per `OTP_RATE_LIMIT_WINDOW_MINUTES`
  (15) → `429 OTP_RATE_LIMITED`.
- A `BLOCKED` number gets `403 ACCOUNT_BLOCKED` and no SMS.

### `POST /auth/otp/verify`

```jsonc
// request
{ "phone": "9876543210", "code": "157773", "role": "DONOR" }

// 200
{
  "accessToken": "…", "refreshToken": "…", "tokenType": "Bearer", "expiresIn": "15m",
  "user": { "id": "…", "name": "", "phone": "+919876543210", "role": "DONOR", "status": "ACTIVE", … },
  "isNewUser": true,
  "reactivated": false,     // true when this login revived a DEAD donor
  "profileComplete": false  // false → the app should route to the registration form
}
```

- `role` (`DONOR` | `RECEIVER`) is only applied when the account is **created**. An
  existing user keeps their stored role, so a donor who opens the app through the
  "Find Blood" entry point is not silently demoted to `RECEIVER`.
- `OTP_MAX_ATTEMPTS` (5) wrong guesses burn the code; the error message counts down the
  remaining attempts so the app can announce it.
- A brand-new user is created with an empty `name` — the donor/receiver registration
  endpoints in Phase 3 fill in the profile. `profileComplete` tells the client which
  screen to land on.
- `STAFF`/`ADMIN` accounts are refused here with `403 STAFF_MUST_USE_PASSWORD`.

### `POST /auth/staff/login`

```jsonc
{ "email": "staff1@redexpress.local", "password": "…" }
```

Unknown email and wrong password return the identical `401 INVALID_CREDENTIALS`, and a
bcrypt comparison runs either way, so the endpoint cannot be used to enumerate staff
accounts. Non-`ACTIVE` staff get `403 ACCOUNT_INACTIVE`.

### `POST /auth/refresh`

```jsonc
{ "refreshToken": "…" }   →   { "accessToken": "…", "tokenType": "Bearer", "user": { … } }
```

Re-checks `tokenVersion` against the DB, so a donor marked dead cannot quietly refresh
their way back in — they must re-verify by OTP.

### `GET /auth/session`

`requireAuth`-protected probe that returns the current user. The mobile app calls it on
launch to find out whether its stored token is still good.

---

## Using the middleware

```js
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth.js';

router.get('/donors/me', requireAuth, handler);                       // any signed-in user
router.post('/crm/call-logs', requireAuth, requireRole('STAFF', 'ADMIN'), handler);
router.post('/crm/donors/:id/reactivate', requireAuth, requireRole('ADMIN'), handler);
router.get('/donors/search', optionalAuth, handler);                  // works signed out
```

`requireAuth` sets `req.user` (the full Prisma user row) and `req.auth`
(`{ userId, role, tokenVersion }`).

---

## Token design notes

- Access and refresh tokens are signed with **different secrets** (`JWT_ACCESS_SECRET`,
  `JWT_REFRESH_SECRET`), and each carries a `typ` claim that is checked on verify. A
  refresh token presented as a bearer credential is rejected as `INVALID_TOKEN`.
- Secrets are asserted at boot in [src/config/env.js](../src/config/env.js) — a
  misconfigured deployment fails to start rather than signing tokens with `undefined`.
- The mobile app stores tokens in `expo-secure-store` only (Phase 7); the CRM keeps them
  in `httpOnly` cookies set server-side (Phase 12), so the JWT is never in browser JS.

## Error codes

| Code | Status | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Body failed the zod schema; `fields` maps input name → message |
| `INVALID_PHONE` | 400 | Number could not be normalised to E.164 |
| `OTP_NOT_FOUND` | 400 | No live code for that number — request a new one |
| `OTP_EXPIRED` | 400 | Code older than `OTP_EXPIRY_MINUTES` |
| `OTP_INVALID` | 400 | Wrong code; message includes attempts remaining |
| `OTP_ATTEMPTS_EXCEEDED` | 400 | `OTP_MAX_ATTEMPTS` exceeded; code burned |
| `OTP_RATE_LIMITED` | 429 | Too many codes requested for this number |
| `SMS_SEND_FAILED` | 502 | Provider rejected the message |
| `NO_TOKEN` | 401 | Missing or malformed `Authorization: Bearer …` |
| `INVALID_TOKEN` | 401 | Bad signature, wrong token type, or unknown user |
| `TOKEN_EXPIRED` | 401 | Access token past its 15 minutes — call `/auth/refresh` |
| `TOKEN_VERSION_MISMATCH` | 401 | **Forced logout.** Clear tokens and send the user to sign in again |
| `INVALID_CREDENTIALS` | 401 | Staff email/password wrong |
| `ACCOUNT_BLOCKED` | 403 | `status = BLOCKED` |
| `ACCOUNT_INACTIVE` | 403 | Staff account not `ACTIVE` |
| `STAFF_MUST_USE_PASSWORD` | 403 | Staff/admin tried the OTP path |
| `FORBIDDEN` | 403 | Role not permitted for this route |

The two the mobile client must special-case: `TOKEN_EXPIRED` → silently refresh;
`TOKEN_VERSION_MISMATCH` → wipe storage and route to Login.

---

## SMS providers

`services/smsService.js` exposes one function, `sendSms(phone, text)`. The gateway is an
env decision:

| `SMS_PROVIDER` | Behaviour |
| --- | --- |
| `console` | Prints the message to the server log and returns it as `devCode`. Development only. |
| `msg91` | Sends via MSG91's flat SMS API. Needs `MSG91_AUTH_KEY` and `MSG91_SENDER_ID`. |

Adding a provider means writing a `{ name, send }` object and registering it in the
`providers` map — nothing else in the codebase changes.

---

## Testing it

```bash
npm run dev        # terminal 1
npm run smoke:auth # terminal 2
```

[scripts/smoke-auth.mjs](../scripts/smoke-auth.mjs) drives the whole system against a
running server: OTP request/verify, wrong codes, replay, refresh, wrong token type,
`BLOCKED` handling, staff login (including the enumeration check), and the full
**mark-dead → 401 → re-login → ACTIVE** loop that Phase 6 and Phase 14 rely on. It cleans
up the test user afterwards and refuses to run with `NODE_ENV=production`.

Manual version:

```bash
curl -s -X POST localhost:4000/auth/otp/request \
  -H 'Content-Type: application/json' -d '{"phone":"9876500011"}'
# → copy devCode from the response (or the server log)

curl -s -X POST localhost:4000/auth/otp/verify \
  -H 'Content-Type: application/json' \
  -d '{"phone":"9876500011","code":"157773","role":"DONOR"}'

curl -s localhost:4000/auth/session -H "Authorization: Bearer <accessToken>"
```
