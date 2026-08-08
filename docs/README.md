# Red Express — run order and manual test checklist

The operational companion to the root [`README.md`](../README.md) (what this is) and
[`ARCHITECTURE.md`](../ARCHITECTURE.md) (how it is put together). This page answers two
questions: **what order do I start things in**, and **what do I check by hand before I believe
it works**.

---

## Where everything is documented

| Topic | Document |
|---|---|
| System design, data model, phase plan | [`../ARCHITECTURE.md`](../ARCHITECTURE.md) |
| Local setup from a fresh clone | [`../README.md`](../README.md) |
| Database, indexes, every `db:*` script | [`../backend/docs/database.md`](../backend/docs/database.md) |
| OTP, JWTs, the `tokenVersion` force-logout | [`../backend/docs/auth.md`](../backend/docs/auth.md) |
| Registration, profiles, photo upload | [`../backend/docs/profiles.md`](../backend/docs/profiles.md) |
| Donor search, Haversine, the matching engine | [`../backend/docs/search-and-matching.md`](../backend/docs/search-and-matching.md) |
| Expo push, and why it needs a real device | [`../backend/docs/notifications.md`](../backend/docs/notifications.md) |
| ACTIVE → DEAD → re-login, end to end | [`../backend/docs/crm-lifecycle.md`](../backend/docs/crm-lifecycle.md) |
| Accessibility audit and TalkBack/VoiceOver steps | [`../mobile/docs/accessibility.md`](../mobile/docs/accessibility.md) |
| Production deployment and secret rotation | [`deploy.md`](deploy.md) |

---

## Run order

Order matters in two places: the API needs its tables before it can answer anything, and the
CRM and app both need the API. Everything else is preference.

```bash
# 0. Once per clone
npm install                                     # from the repo root; covers all three workspaces
cp .env.example backend/.env                    # then fill in the [backend] sections
cp .env.example mobile/.env                     # [mobile]
cp .env.example crm/.env.local                  # [crm]
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # once per JWT secret

# 1. Database — plain Postgres, no PostGIS
docker start redexpress-db  ||  docker run --name redexpress-db \
  -e POSTGRES_USER=redexpress -e POSTGRES_PASSWORD=redexpress -e POSTGRES_DB=redexpress \
  -p 5433:5432 -v redexpress-pgdata:/var/lib/postgresql/data -d postgres:16

# 2. Schema and sample data (first run, or after pulling a new migration)
npm run db:migrate --workspace backend
npm run db:seed    --workspace backend          # 1 admin, 2 staff, 30 donors, 3 receivers

# 3. API  →  http://localhost:4000
npm run dev:backend
curl http://localhost:4000/health/ready         # {"status":"ready","database":{"status":"up",…}}

# 4. CRM  →  http://localhost:3000
npm run dev:crm

# 5. App  →  Expo dev server
npm run dev:mobile
```

Sign in to the CRM as `admin@redexpress.local` or `staff1@redexpress.local` with the passwords
from `backend/.env`.

### Tests

```bash
npm run test             --workspace backend   # unit only — pure functions, no database
npm run test:integration --workspace backend   # real app + real Postgres (needs step 1 and 2)
npm run test:all         --workspace backend   # both, unit first

npm run verify:contrast  --workspace mobile    # every theme colour pair against WCAG AA
npm run build            --workspace crm       # the CRM's only compile-time check
```

The split is deliberate: `npm test` works on a fresh clone with nothing running, so a failure
there is always a failure of the code and never of a missing Docker container.

The integration suite creates its own accounts in a reserved phone range (`+9189999…`) and
deletes them afterwards, so it can be run against a seeded development database without
disturbing the seed.

---

## What to test manually

Automated tests cover the OTP flow, the mark-dead lifecycle, the Haversine radius search, the
rate limiters and the security headers. They cannot cover the four things below: a real SMS, a
real push notification, a real phone call, and what the app sounds like.

### A. The donor journey, with a screen reader on

**This is the one that matters most, and the one nothing else in this repo checks.** Turn the
screen reader on *before* opening the app, and then do not look at the screen.

- Android: Settings → Accessibility → TalkBack. Swipe right = next, double-tap = activate.
- iOS: Settings → Accessibility → VoiceOver. Same gestures.

1. **Landing** — the heading is read on arrival without swiping. Both buttons announce what
   they do, not just their text.
2. **Register → Become a Donor → phone** — the field announces its label, not just a
   placeholder. Type a number, activate Send OTP, and hear *"One time password sent to …"*.
3. **OTP** — the field is announced once as "Verification code", **not** as six separate boxes.
   The resend countdown is spoken, not only shown. Enter a wrong code and hear the error and
   the remaining attempts. Enter the right one and hear "Verified".
4. **Donor form** — move through every field without looking. Each dropdown announces its
   current value; the terms checkbox announces "checked"/"not checked"; the photo picker says
   "Photo selected". Submit with a field empty: the first error is announced *and* focus lands
   on that field.
5. **Location permission** — the rationale is readable before the OS dialog appears. Decline it,
   and confirm registration still completes using the typed address.
6. **Home** — availability, blood group and city are read as one sentence, not six fragments.
7. **Find donors** — run a search and hear *"N donors found"* announced. Each result card reads
   as one phrase: name, blood group, distance, then a separately reachable Call button.
8. **Privacy and permissions** — reachable from Home. Each permission announces its state in
   words ("Location: Allowed"), never by colour alone.
9. **Settings** — turn Voice guidance on and hear it confirm itself aloud. Turn Big text on and
   confirm nothing clips or truncates at the largest OS font size.

Fail any step and the fix is a bug, not a nice-to-have. See
[`../mobile/docs/accessibility.md`](../mobile/docs/accessibility.md) for the full checklist and
the known gaps.

### B. The dead-donor loop, across all three apps

The integration test proves this at the API layer. Do it once by hand, because it is the only
behaviour that spans every piece of the system.

1. Sign in on the app as a seeded donor and confirm the home screen loads.
2. In the CRM, find that donor. Press **Call** and confirm the phone dialler opens with their
   number. Log an outcome (*No answer*) and confirm it appears in their history immediately.
3. Press **Mark as unreachable**. Read the confirmation dialog: it should say in plain words
   that this removes them from search and forces them to sign in again. Confirm.
4. The row's status badge changes to **DEAD** without a page reload.
5. Back on the app, do anything that calls the API. The donor is signed out with an explanation
   — not a silent failure, not a crash.
6. Search for that donor in the app as another user. They are gone.
7. On the app, sign in again with the same number and a fresh OTP. They are **ACTIVE** again —
   and still *not available*, because re-verifying proves the number reaches them, not that
   they are free to donate this week. Turn availability on and confirm they reappear in search.
8. As **STAFF**, confirm there is no Reactivate button. As **ADMIN**, confirm there is.

### C. Notifications — needs a dev build on a real device

Expo Go cannot receive pushes. With `PUSH_PROVIDER=expo` and an EAS dev build:

1. Grant notification permission from the in-app card (not the raw OS prompt).
2. From another account, post a blood request near the donor's location.
3. The alert arrives with the hospital and the distance, and reads cleanly aloud — no emoji
   carrying meaning, no ALL-CAPS words spelled out letter by letter.
4. Tapping it deep-links to the request, **not** to the home screen.
5. Accept. The requester is notified, and the hospital contact details appear.
6. Sign out, then post another matching request: no notification arrives on that device.

### D. SMS — needs a real phone

With `SMS_PROVIDER=msg91`, request one code and confirm it arrives, is six digits, and works.
A broken SMS key is invisible server-side: the API returns 200 and nobody receives anything.

### E. Privacy boundaries

Quick, and the thing most likely to regress quietly.

1. Search donors as an app user. The response has `name`, `phone`, `city` and a **rounded**
   `distanceKm` with `distanceIsApproximate: true` — and **no** `address`, `pincode`,
   `latitude` or `longitude`.
2. Run the same search with a staff token. All of those fields are present, and the distance is
   exact.
3. `GET /crm/stats` with an app user's token returns 403.
4. `GET /requests/:id` for a request you neither posted nor were matched to returns 403.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| API exits at boot with "… is not set" | A required env var is missing. `config/env.js` fails fast on purpose. |
| `GET /health/ready` returns 503 | Postgres unreachable. `docker start redexpress-db`. |
| Every OTP request returns 429 | The per-phone ceiling: 3 codes per 15 minutes. Use a different number or wait. |
| Login fails with `CSRF_FAILED` | The CRM page was open across a server restart. Reload it. |
| Sign-in returns `BACKEND_UNREACHABLE` | The CRM is up and the API is not — check `BACKEND_API_BASE_URL`. |
| App cannot reach the API from a phone | `localhost` is the phone itself. Use the machine's LAN IP in `EXPO_PUBLIC_API_BASE_URL` (`10.0.2.2` on the Android emulator). |
| No OTP arrives, API says 200 | `SMS_PROVIDER=console` — the code is in the API log, and in the response as `devCode`. |
| No push arrives | Expo Go cannot receive them. You need a dev build; see [`../backend/docs/notifications.md`](../backend/docs/notifications.md). |
| Integration tests fail on unique constraints | A previous run was interrupted. They self-clean on the next start; if not, delete users with phones starting `+9189999`. |
