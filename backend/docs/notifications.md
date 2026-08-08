# Push notifications (Phase 5)

How Red Express tells a donor that someone nearby needs their blood.

> **Expo Go cannot receive push notifications.** Testing real delivery needs a physical
> device running an EAS **dev build** (or a production build). Everything short of the
> wire — inbox rows, payloads, read state, token lifecycle — can be tested on a laptop
> with `PUSH_PROVIDER=console`. See [Testing](#testing) below.

---

## The path a notification takes

```
POST /requests
  └─ requestService.createRequest
       └─ matchingEngine.createMatchesForRequest
            ├─ finds donors  (bounding box → Haversine, Phase 4)
            ├─ writes RequestMatch rows
            └─ notificationService.notifyMatchedDonors
                 ├─ pushMessages.buildMatchNotification   ← the words
                 ├─ writes one Notification row per donor ← the inbox
                 ├─ pushService.sendPushMessages          ← the wire (Expo)
                 └─ stamps RequestMatch.notifiedAt
```

Four modules, split so each can be reasoned about alone:

| Module | Responsibility | Knows about |
|---|---|---|
| `services/pushMessages.js` | The text and the deep-link payload. Pure functions. | Blood requests, nothing else |
| `services/pushService.js` | Transport: chunking, tickets, receipts, dead tokens. | Expo, nothing about blood |
| `services/notificationService.js` | Inbox rows, fan-out, dead-token cleanup, read state. | Both |
| `services/deviceTokenService.js` | Which phone belongs to which account. | Neither |

---

## Endpoints

| Method | Path | Who | Notes |
|---|---|---|---|
| `POST` | `/devices/register` | any signed-in user | `{ expoPushToken, platform }`. Upsert. `201` on first registration, `200` on repeat. |
| `GET` | `/devices` | any signed-in user | The caller's own registered devices. |
| `DELETE` | `/devices/:token` | owner | Call on logout. URL-encode the token — it contains brackets. |
| `GET` | `/notifications` | any signed-in user | `?unreadOnly=true`, `?page=`, `?pageSize=`. Returns `unreadCount` on every response. |
| `PATCH` | `/notifications/:id/read` | owner | Idempotent; a second call keeps the original `readAt`. |

A notification belonging to somebody else answers **404**, not 403 — a stranger must not
be able to probe for valid ids.

### The payload a phone receives

```jsonc
{
  "title": "Urgent: A negative blood needed nearby",
  "body":  "Apollo Hospital, Bhubaneswar, about 6.1 kilometres away. 2 units needed.",
  "data": {
    "type": "BLOOD_REQUEST_MATCH",
    "requestId": "cmsh1t70c0008z4u3ht3fgkpk",
    "matchId":   "cmsh1t70v0009z4u387t5cqie",
    "notificationId": "cmsh1t711000bz4u3o8knffyk",
    "bloodGroup": "A_NEG",
    "urgency": "URGENT",
    "distanceKm": 6.1,
    "screen": "request-detail"
  }
}
```

`matchId` is what lets Phase 10 open the Accept / Decline screen straight from the
notification tray, and `notificationId` lets that tap mark the inbox row read without a
second round-trip. `screen` is sent by the server rather than derived by the client so a
broken deep link can be fixed without shipping an app update.

The requester gets a second notification type, `BLOOD_REQUEST_ACCEPTED`, when a donor
accepts. Declines are deliberately silent: a person waiting in a hospital does not need a
buzz for every "no", and the accepted count on their screen already tells them.

---

## Writing notification text

The copy rules live in `services/pushMessages.js` and are enforced by
`tests/notifications.test.js`. They exist because a blind donor is the primary user of
this app, and for them a push notification is **heard**, not read.

- **No emoji.** TalkBack reads 🩸 as "drop of blood" mid-sentence, or skips it entirely.
  An emoji must never be the only thing carrying meaning.
- **No ALL CAPS.** Several screen readers spell "URGENT" out letter by letter. Write
  "Urgent".
- **No abbreviations that depend on being seen.** `km` and `O-` are unreliable spoken, so
  distances say "kilometres" and blood groups use `bloodGroupLabel()` ("O negative"),
  never `bloodGroupShort()` ("O-"). There is a test asserting the short form never
  appears in notification text.
- **Front-load.** Android truncates the body in the shade, and a screen reader can be
  interrupted. Urgency and blood group come first; there are no pleasantries.
- **Full stops, not commas or bullets.** A full stop is the punctuation that reliably
  makes a screen reader pause, which is the listener's only chance to take it in.
- **Never invent a distance.** A donor matched by district has no measured distance, so
  the clause is omitted. "0 kilometres away" would send someone across the state
  believing they were around the corner.

---

## Delivery, failure, and dead tokens

**Sending never throws.** Every caller is mid-way through something that matters more —
creating a blood request, recording a response. Failures are returned and logged. A
receiver standing in a hospital corridor must not see their request fail because Expo had
a bad minute; the `RequestMatch` rows are committed either way, and staff can still work
them as a call list from the CRM.

**The inbox row is written first and unconditionally.** A push can be lost to a revoked
permission, a dead token, an outage, or a basement. The `Notification` row survives all of
it, and for a donor reading with a screen reader the inbox is often the primary surface
rather than a fallback.

**Two chances to learn a token is dead.** Expo answers a send with a *ticket* (accepted or
rejected outright) and, some minutes later, a *receipt* (what the platform gateway
actually did). Either can report `DeviceNotRegistered` — usually an uninstall — and both
feed the same cleanup, which deletes the row from `DeviceToken`.

Receipts are checked on a delayed, unref'd timer (`PUSH_RECEIPT_DELAY_MS`, default 15
minutes) because Expo asks that they not be polled immediately.

> **Known limitation.** Because that timer lives in process memory, a restart loses any
> pending receipt check. The cost is a dead token surviving until its owner's next
> notification, which the ticket pass usually catches anyway. Making it durable would mean
> a `PushReceipt` table and a worker — worth doing if the token table ever starts growing
> faster than the user table.

**A push token identifies an installation, not a person.** If a second account signs in on
the same handset, the `DeviceToken` row moves to whoever registered last (the unique
constraint on `expoPushToken` makes this the only sane outcome). Anything else would push
one person's blood requests to another person's phone. This is also why the app must call
`DELETE /devices/:token` on logout — especially on a shared device, where a later
notification would otherwise leak a stranger's emergency.

---

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PUSH_PROVIDER` | `console` | `console` prints to the server log; `expo` delivers for real. |
| `EXPO_ACCESS_TOKEN` | *(empty)* | Only needed when the Expo project has push security enabled. |
| `EXPO_PUSH_CHUNK_SIZE` | `100` | Expo's own limit is 100; a smaller value only makes chunks smaller. |
| `PUSH_ANDROID_CHANNEL_ID` | `blood-requests` | The channel the app creates at startup. **Its importance — not anything the server sends — decides whether the phone makes a sound.** |
| `PUSH_TTL_SECONDS` | `3600` | Expo discards an undelivered message after this. A blood request surfacing six hours late is worse than one that never arrives. |
| `PUSH_CHECK_RECEIPTS` | `true` | Whether to run the second-stage receipt pass. |
| `PUSH_RECEIPT_DELAY_MS` | `900000` | How long to wait before reading receipts. |

Priority is per-message, not configured: `CRITICAL` and `URGENT` requests send with Expo
priority `high` (which wakes a dozing phone); `NORMAL` sends at `default` and saves the
donor's battery. If everything is urgent, nothing is.

`PUSH_PROVIDER=console` in production logs a loud one-time warning at first use —
silently printing every "blood needed nearby" to a log file would be a quiet, total
failure of the product's only real-time channel.

---

## Testing

### Without a device (what CI and a laptop can do)

```bash
npm test --workspace backend                    # notification copy, unit tests
npm run dev --workspace backend                 # terminal 1
npm run smoke:notifications --workspace backend # terminal 2
```

`smoke-notifications.mjs` runs the whole loop against a seeded database with
`PUSH_PROVIDER=console`: device registration and re-assignment, a request that notifies
matched donors, `notifiedAt` stamping, the deep-link payload, inbox paging and read state,
cross-user access, acceptance notifying the requester, re-matching not re-notifying, and
unregistering on logout. It cleans up everything it creates.

With the console provider each notification is printed by the API:

```
[push:console] to ExponentPushToken[...]
  Urgent: A negative blood needed nearby
  Apollo Hospital, Bhubaneswar, about 6.1 kilometres away. 2 units needed.
  data: {"type":"BLOOD_REQUEST_MATCH","requestId":"...","matchId":"...","screen":"request-detail"}
```

Read those lines out loud. If a sentence is awkward to say, it is worse to hear.

### With a device (Phase 10)

1. Build a dev client: `eas build --profile development --platform android` (Expo Go will
   not work — it has no push credentials of its own).
2. Install it on a **physical** device. Simulators and emulators cannot receive pushes.
3. In the app, request notification permission and read the Expo push token
   (`expo-notifications` → `getExpoPushTokenAsync({ projectId })`).
4. `POST /devices/register` with that token.
5. Set `PUSH_PROVIDER=expo` in `backend/.env` and restart the API.
6. Post a blood request from a second account near the donor's coordinates.

Checklist for that pass:

- [ ] The notification arrives with the phone locked.
- [ ] Tapping it opens the respond screen for the right request (`data.matchId`).
- [ ] With TalkBack or VoiceOver on, the notification is read as coherent sentences —
      no letter-by-letter spelling, no "drop of blood", no "O minus".
- [ ] A `CRITICAL` request wakes the screen; a `NORMAL` one does not.
- [ ] Uninstalling the app and posting another request removes the token from
      `DeviceToken` (check the API log for `dropped N unregistered device token(s)`).
- [ ] Logging out stops notifications reaching that handset.

---

## Related

- [`search-and-matching.md`](./search-and-matching.md) — how the donors being notified are chosen.
- [`auth.md`](./auth.md) — the token-version force-logout a "dead" donor gets.
- `docs/accessibility.md` (Phase 11) — the app-side half of the screen-reader story.
