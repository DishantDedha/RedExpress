# The donor lifecycle (Phase 6)

`ACTIVE` → `DEAD` → *(donor re-verifies by OTP)* → `ACTIVE`, end to end.

> **"Dead" means unreachable, not deceased.** A staff member has rung the number enough
> times to conclude it no longer reaches the person behind it. The account is taken out of
> circulation until they prove otherwise by opening the app. Nobody has died.
>
> The word is in the schema and the API because it is the word the product uses. Every
> string a human reads says **unreachable** instead — see [Wording](#wording).

---

## Why the loop exists

A blood-donor database rots quietly. People change numbers, leave the state, or stop
answering, and nothing in the app tells us. The damage is not the stale row itself: it is
that a receiver in a hospital corridor sees "12 donors nearby", rings four of them, and
reaches nobody.

Staff working the call list are the only ones who find out. So they are the ones who mark
it, from the same screen they are calling on — and the donor's own next sign-in is what
undoes it, because passing an OTP is exactly the proof that the number still reaches them.

---

## What "mark dead" actually does

`POST /crm/donors/:userId/mark-dead` performs four writes **in one transaction**:

| Write | Effect | Where it bites |
|---|---|---|
| `User.status = DEAD` | Out of search, out of matching | `donorBaseWhere` filters `user.status: 'ACTIVE'`, and the matching engine reuses that same filter — so a dead donor cannot be searched for *or* notified |
| `User.tokenVersion + 1` | **Forced logout** | `requireAuth` compares the JWT's `tokenVersion` claim against this column and 401s on a mismatch — see [auth.md](./auth.md) |
| `DonorProfile.isAvailable = false` | Belt and braces | What the donor sees on their own profile when they come back |
| `CallLog(outcome: MARKED_DEAD)` + `AuditLog` | The record | Who did it, when, against which request, and in whose words |

They are one transaction on purpose. A status change that landed without its token bump
would leave a donor invisible in search but still signed in and still holding a valid
token — the exact half-state this feature exists to prevent.

`MARKED_DEAD` is **not** an outcome `POST /crm/call-logs` will accept. Recording it there
would write the log without the status change or the token bump, so the API rejects it
with a 400 pointing at this endpoint instead.

---

## The full loop

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │   ACTIVE                                                                 │
  │     │                                                                    │
  │     │  staff ring the donor, no answer                                   │
  │     │  POST /crm/call-logs { outcome: NO_ANSWER }        ← attempt 1, 2… │
  │     │                                                                    │
  │     │  POST /crm/donors/:id/mark-dead                                    │
  │     ▼                                                                    │
  │   DEAD ───────────────────────────────────────────────────┐              │
  │     │                                                     │              │
  │     │  • gone from GET /donors/search                     │              │
  │     │  • never appears in a new RequestMatch              │              │
  │     │  • every existing JWT 401s: TOKEN_VERSION_MISMATCH  │              │
  │     │  • the app wipes its tokens and shows Login         │              │
  │     │                                                     │              │
  │     │  donor opens the app, enters their number,          │  ADMIN only: │
  │     │  receives an SMS, types the code                    │  POST …      │
  │     │  POST /auth/otp/verify                              │  /reactivate │
  │     ▼                                                     │              │
  │   ACTIVE ◄─────────────────────────────────────────────────┘             │
  │     │                                                                    │
  │     └── isAvailable is still false — the donor turns it back on          │
  │         themselves from their profile                                    │
  └──────────────────────────────────────────────────────────────────────────┘
```

### The return trip is the donor's own doing

Nothing in the CRM is needed for it. `completePhoneLogin` (Phase 2, `authService.js`)
flips `DEAD → ACTIVE` on a successful OTP verify and returns `reactivated: true`.

It deliberately does **not** touch `tokenVersion`. The bump already happened when staff
marked them dead; bumping again would invalidate the very tokens that response is handing
out.

### Availability is not restored by re-logging in

Re-verifying proves the number reaches them. It does not prove they are free to donate
this week. So `isAvailable` stays `false` until the donor turns it back on from their own
profile (`PATCH /donors/me/availability`) — which also means their first act after coming
back is an explicit, deliberate "yes, ask me".

---

## Who may do what

| Action | STAFF | ADMIN | Why |
|---|:---:|:---:|---|
| Search users, read details, see call history | ✅ | ✅ | The daily job |
| Record a call outcome | ✅ | ✅ | The daily job |
| Mark unreachable | ✅ | ✅ | A report from the phones |
| Reactivate | ❌ | ✅ | Overrules a report from the phones |

The split is not about trust, it is about what the two actions *claim*. "I could not reach
this person" is something the caller knows. "This person is fine actually" contradicts
someone who was on the phone, and should cost a conversation.

### What reactivate does *not* do

It does not restore anyone's session. The token bump from mark-dead is never rolled back,
so a reactivated donor still signs in again next time they open the app — they simply are
not hidden from search in the meantime. Rolling it back would mean handing a working
session to whoever is holding that phone now, which is what the bump was protecting
against.

It *does* restore the availability the donor had before staff switched them off, read back
out of the mark-dead audit row's `metadata.wasAvailable`. A donor who had switched
themselves off before any of this stays switched off.

---

## Endpoints

All of these sit behind `requireAuth` + `requireRole('STAFF', 'ADMIN')`, applied on the
router rather than per route, so a new endpoint added under `/crm` cannot forget the check.

| Method | Path | Who | Notes |
|---|---|---|---|
| `GET` | `/crm/stats` | staff | Donors by blood group and status, open requests, today's matches / calls |
| `GET` | `/crm/users/search` | staff | `?q=&role=&bloodGroup=&status=&state=&district=&city=&page=&pageSize=` |
| `GET` | `/crm/users/:userId` | staff | Full profile, requests posted, matches, call history, audit trail |
| `GET` | `/crm/donors/nearby?requestId=` | staff | The calling worklist, nearest first |
| `GET` | `/crm/call-logs` | staff | `?donorUserId=&requestId=&staffId=&take=` |
| `POST` | `/crm/call-logs` | staff | `{ donorUserId, requestId?, outcome, note? }` |
| `POST` | `/crm/donors/:userId/mark-dead` | staff | `{ note?, requestId? }` |
| `POST` | `/crm/donors/:userId/reactivate` | **admin** | `{ note? }` |

### `GET /crm/users/search`

One box matched against name, email and phone. Phone gets three attempts, because staff
type what is in front of them: the raw text, the digits alone (`9876500001` finds
`+919876500001`), and the E.164 normalisation. State/district/city are matched against
`DonorProfile` **or** `User`, since a donor's address lives on the profile and a receiver
from the quick form has theirs on the user row.

Every row carries `lastCall` and `callCount`, so the table answers "have we tried this
person, and how often?" without a second request.

### `GET /crm/donors/nearby?requestId=`

Normally the stored `RequestMatch` rows: the same people who got the push, in the same
order, with the distance frozen at match time so the list does not reshuffle under a staff
member working down it. Donors matched by administrative area have `distanceKm: null` and
sort last — unrankable, not nearest.

When a request has **no** matches, the engine is re-run in preview mode rather than
returning an empty page. That writes nothing and notifies nobody; `source: "preview"` says
so, and `matching.steps` shows how far the radius had to walk.

### Sensitive actions carry a note

`mark-dead`, `reactivate` and `call-logs` all accept a free-text `note` (up to 1000
characters). For a call it lands on the `CallLog`; for the two lifecycle actions it lands
on both the `CallLog` and the `AuditLog`, alongside machine-readable before/after state:

```json
{
  "action": "DONOR_MARKED_DEAD",
  "note": "Number rings out. Three attempts over two days.",
  "metadata": {
    "previousStatus": "ACTIVE",
    "previousTokenVersion": 0,
    "newTokenVersion": 1,
    "wasAvailable": true,
    "requestId": "cm..."
  }
}
```

The audit row is written inside the same transaction as the status change. A status change
without its audit row, or an audit row describing a change that did not commit, are both
worse than neither.

---

## What the mobile app has to do

Exactly one thing, and Phase 7 already builds it: on any `401` whose body is

```json
{ "error": { "code": "TOKEN_VERSION_MISMATCH", "message": "Your session has ended. Please sign in again." } }
```

clear the stored tokens from `expo-secure-store` and route to Login. There is no separate
"you were marked unreachable" signal and there should not be — from the donor's side this
is an ordinary expired session, and it is fixed by the ordinary sign-in they already know.

The `message` is safe to display and to announce; it is written for a screen reader.

---

## Wording

The database enum says `DEAD` and it stays that way — it is a stable machine value the CRM
and the app both switch on. Every string a human sees or hears says **unreachable**:

| Surface | Text |
|---|---|
| Confirmation modal (Phase 14) | "This sets the donor to unreachable, removes them from search and notifications, and forces them to sign in again next time they open the app." |
| Success message | "*Name* is marked unreachable. They will not appear in search or receive alerts until they sign in again." |
| Already-marked conflict | "*Name* is already marked unreachable." |
| Reactivated | "*Name* is active again. They still need to sign in on the app, because their old session was ended when they were marked unreachable." |

The `effects` block on both responses spells the consequences out in fields
(`removedFromSearch`, `sessionsInvalidated`, `tokenVersion`, `recoverableBy`) so the CRM
can state them rather than implying them with the colour of a badge — which is also the
Phase 11 accessibility rule applied to the staff dashboard.

---

## Testing

`npm run smoke:crm --workspace backend` walks the whole loop against a live database and
a running server, and asserts the consequences rather than assuming them:

```
donor signs in
  → staff record two NO_ANSWER call logs
  → staff mark them unreachable
  → the donor's existing access token returns 401 TOKEN_VERSION_MISMATCH
  → the refresh token is refused too
  → the donor is gone from GET /donors/search
  → a second mark-dead is a 409, and tokenVersion does not move again
  → the donor re-verifies by OTP and is ACTIVE with reactivated: true
  → availability is still off; they switch it on and reappear in search
  → ADMIN reactivate restores the remembered availability
  → STAFF reactivate is 403; marking a staff account is 400
```

Prerequisites: `npm run db:seed` once, `SMS_PROVIDER=console`, and `npm run dev` in
another terminal. The script marks one seeded donor unreachable and restores their
original status, availability, call logs and audit rows on the way out — including after a
crash — so it can be run repeatedly against the same seed.

The pure helpers (`latestCallByDonor`, `crmUserRow`, `startOfToday`, and the guard that
keeps `MARKED_DEAD` out of the manual call outcomes) are unit-tested in
`tests/crm.test.js`.

---

## Related

- [auth.md](./auth.md) — the token-version mechanism this is built on
- [search-and-matching.md](./search-and-matching.md) — why `status: ACTIVE` removes a donor from both search and notifications
- [notifications.md](./notifications.md) — what a matched donor receives
