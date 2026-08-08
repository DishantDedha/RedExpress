# Registration and profiles (Phase 3)

Phase 2 gets a person a verified phone number and a token. This phase is what turns that
bare `User` row into a donor or a receiver, and it is what the mobile registration screens
(mockup images 6, 7 and 11) post to.

Every endpoint here requires a Phase 2 access token: `Authorization: Bearer <accessToken>`.

---

## The two registration paths

| | Donor | Receiver |
|---|---|---|
| Endpoint | `POST /donors/register` | `POST /receivers/register` |
| Body | `multipart/form-data` or JSON | JSON |
| Fields | the full form — identity, blood group, address, optional photo | full name, state, district, optional coordinates |
| Creates | a `DonorProfile` row, `role = DONOR` | nothing extra; `role = RECEIVER` |
| Location stored on | `DonorProfile.latitude/longitude` | `User.latitude/longitude` |

The asymmetry is deliberate. A donor is a long-lived searchable record and needs a full
address; a receiver is filling in a form during an emergency, so it asks for the minimum
that still lets a request be routed. Receivers therefore have nowhere to put an address,
which is why `User` carries nullable `state` / `district` / `city` / `latitude` /
`longitude` columns — for a **donor** those stay null and `DonorProfile` is the single
source of truth, so proximity search never has two places to look.

### Roles are not downgraded

A user who already has a `DonorProfile` and then fills in the receiver form keeps
`role = DONOR`. Donors need blood too, and silently demoting one would drop them out of
every search and every notification. The receiver form still updates their name and coarse
location.

---

## Endpoints

### `POST /donors/register`

`multipart/form-data` (needed for the photo) or `application/json` when there is no photo.

| Field | Required | Notes |
|---|---|---|
| `fullName` | yes | 2–80 characters |
| `email` | yes | unique across all users; a clash is `409 EMAIL_IN_USE` |
| `phone` | no | prefilled from the OTP session; if sent it **must** match the verified number |
| `bloodGroup` | yes | `A_POS` … `AB_NEG`, or the display form `A+` / `O-` |
| `gender` | yes | `MALE` / `FEMALE` / `OTHER`, case-insensitive |
| `dateOfBirth` | no | `YYYY-MM-DD`; enforced to 18–65 when present |
| `state`, `district`, `city` | yes | free text, ≤ 80 characters |
| `pincode` | yes | six digits, not starting at zero |
| `address` | yes | 5–500 characters |
| `latitude`, `longitude` | no | send both or neither |
| `password`, `confirmPassword` | no | app accounts sign in by OTP; a password is optional |
| `profilePhoto` | no | JPG, PNG or PDF, ≤ 2 MB |

Returns `201` with `{ user, donorProfile, locationSource, message }`.

### `GET /donors/me` · `PATCH /donors/me`

`GET` is `404 PROFILE_NOT_FOUND` until the donor has registered — that is the app's cue to
route to the registration form.

`PATCH` takes any subset of the register fields plus `isAvailable` and `removePhoto`. It
accepts JSON or multipart, so replacing a photo and editing a field are the same call. A
`PATCH` with no fields *and* no file is `400 NOTHING_TO_UPDATE`.

### `PATCH /donors/me/availability` — `{ "isAvailable": true | false }`

### `PATCH /donors/me/last-donation` — `{ "date": "2026-01-15" }` or `{ "date": null }`

`null` clears the date: "I have never donated" is a real answer, not a missing value.

Both return the usual payload plus a `message` written as a plain sentence
("You are now shown as available to donate.") — the mobile screen announces that string
verbatim through the live region, so it must read correctly with no visual context.

### `POST /receivers/register`

`{ fullName, state, district, city?, email?, phone?, latitude?, longitude? }` → `201`.

### `GET /me`

Works for every role. Returns `{ user, donorProfile, profileComplete }`; staff get
`donorProfile: null`. The app calls this on launch to choose between the home screen and
the registration form without a second round trip.

---

## Response shape

Every endpoint in this phase answers with the same envelope, so the client needs one parser:

```json
{
  "user": { "id": "…", "name": "…", "phone": "+91…", "role": "DONOR", "status": "ACTIVE", "hasPassword": false },
  "donorProfile": { "bloodGroup": "O_POS", "isAvailable": true, "latitude": 20.2961, "hasLocation": true },
  "locationSource": "device",
  "message": "Your donor account is ready."
}
```

`passwordHash` and `tokenVersion` never appear — the views in `services/profileService.js`
are allow-lists, not `delete` calls on the Prisma row.

Errors keep the Phase 2 envelope, `{ error: { code, message, fields? } }`, where `fields`
maps a form field to its problem. The mobile forms attach each entry to the matching input
and announce the first one, so every message is written to make sense read aloud.

---

## Coordinates: device, then geocoder, then nothing

`resolveCoordinates()` in `services/profileService.js`:

1. **Client sent `latitude` + `longitude`** → stored as-is, `locationSource: "device"`.
2. **Otherwise, if `GEOCODER_PROVIDER` is not `none`** → the typed address is geocoded,
   `locationSource` is the provider name.
3. **Otherwise** → both columns stay `null`, `locationSource: "none"`.

Case 3 is not a failure. A donor with no coordinates is still matched by
state/district/city through the administrative-area fallback in Phase 4, so a geocoder
outage or a declined GPS permission degrades match quality instead of turning people away
at signup. Geocoding never throws — `geocodingService.js` logs and returns `null`.

`locationSource` is returned to the client so it can tell the user what actually happened
("Using your current location" vs "Using your typed address"). For a blind user that
sentence is the *only* cue that the location permission mattered.

On `PATCH`, coordinates follow the address: an explicit lat/lng always wins, but a donor
who moves and only retypes their address is re-geocoded rather than left at the old
position.

### Geocoder providers

| `GEOCODER_PROVIDER` | Notes |
|---|---|
| `none` (default) | disabled; the client must supply coordinates |
| `nominatim` | OpenStreetMap. Free, no key, but ~1 req/s and its usage policy forbids heavy use. Sets the identifying `User-Agent` from `GEOCODER_USER_AGENT`. Development only. |
| `google` | Google Geocoding API; needs `GEOCODER_API_KEY`. |

---

## File uploads

`middleware/upload.js` buffers a single file in memory (it is capped at 2 MB, so a temp
file would only add a cleanup path that can fail) and hands it to the storage driver.

- **Types**: `ALLOWED_UPLOAD_MIME`, default `image/jpeg,image/png,application/pdf` — PDF is
  allowed because the form doubles as an ID upload.
- **Size**: `MAX_UPLOAD_BYTES`, default 2 MB. Both limits match the copy printed under the
  upload control in the app, so the client-side text and the server rule cannot drift.
- Multer's own errors are translated into `FILE_TOO_LARGE` / `UNSUPPORTED_FILE_TYPE` /
  `UNEXPECTED_FILE` with a `fields` entry, rather than escaping as a 500.
- A request that is **not** multipart passes straight through, which is why the same route
  serves "register with a photo" and "register without one".

### Storage drivers

`STORAGE_DRIVER` selects the implementation behind one interface
(`save` / `remove` / `keyFromUrl`):

- **`local`** (development) — writes under `STORAGE_LOCAL_DIR` (default `backend/uploads/`,
  gitignored) and `app.js` serves that directory at `/uploads`. Not durable and does not
  survive more than one instance; do not use it in production.
- **`s3`** — any S3-compatible bucket (AWS, Cloudflare R2, MinIO, Spaces). Set
  `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and
  `S3_ENDPOINT` + `S3_PUBLIC_BASE_URL` for non-AWS providers.

> **The AWS SDK is not a declared dependency.** `@aws-sdk/client-s3` is imported lazily by
> `s3Storage.js`, because development runs on the local driver and would otherwise pay
> ~20 MB of install for a code path it never reaches. Deployments that set
> `STORAGE_DRIVER=s3` must run:
>
> ```bash
> npm install @aws-sdk/client-s3 --workspace backend
> ```
>
> The driver throws with that exact command if the package is missing.

### Why keys are random

Stored keys look like `profiles/2026/9f3c…a1.jpg` — 128 bits of randomness, **not** derived
from the user id. Photo URLs get handed to the CRM and cached by clients, and an id-shaped
path would let anyone holding one URL enumerate other people's photos. The key is the
capability.

A replaced or removed photo is deleted from storage, but only *after* the new URL is
committed — the reverse order would leave a record pointing at a file that no longer
exists. If the DB write fails, the freshly uploaded file is discarded so it cannot become
a permanent orphan. Deletion is best effort and never fails the request that triggered it.

---

## Schema changes this phase made

Migration `20260805162005_phase3_profiles`:

- **`DonorProfile.dateOfBirth` is now nullable.** The donor registration form does not ask
  for a birth date, so requiring it would have made the mockup form unsubmittable. It is
  still validated to the 18–65 donation age range whenever it *is* supplied.
- **`User` gained `state`, `district`, `city`, `latitude`, `longitude`** (all nullable) plus
  an index on `(state, district)`. Receivers have no `DonorProfile`, so without these the
  location captured by the receiver form had nowhere to go — and the CRM's
  `?state=&district=` user search in Phase 6 would have had nothing to filter on.

---

## Testing it

```bash
npm run dev              # terminal 1
npm run smoke:profiles   # terminal 2
```

`scripts/smoke-profiles.mjs` drives the whole phase against a live server: donor
registration with a real PNG upload, `A+` → `A_POS` normalisation, oversized and
wrong-type file rejection, the phone-mismatch and half-coordinate guards, photo
replacement (including checking the old file is gone), receiver registration, `GET /me` for
all three roles, and a final check that a donor marked `DEAD` is thrown back to the login
screen. It creates and deletes its own throwaway users, and refuses to run with
`NODE_ENV=production`.
