# Search and matching (Phase 4)

How Red Express finds donors without PostGIS, and how a blood request turns into a list of
people to notify.

- **Search** — `GET /donors/search`, behind the app's "Find Blood Donors" screen and the CRM.
- **Requests** — `POST /requests` and friends.
- **Matching** — a service, not a route: `services/matchingEngine.js`.

---

## 1. Why there is no PostGIS

The schema stores position as two plain `Float` columns (`latitude`, `longitude`) with a
btree index on the pair. That means Red Express runs on any managed Postgres, including
ones that will not install extensions, which is the whole reason for the constraint.

The cost is that Postgres cannot answer "within 20 km of here". So the work is split:

```
    1. Postgres: latitude BETWEEN ? AND ?          <- indexed, cheap, slightly too generous
                 AND longitude BETWEEN ? AND ?
    2. Node:     haversineKm(...) for each survivor <- exact, then drop the extras
```

Step 1 is a **rectangle** around a **circle**, so it lets through the corners — up to ~41%
further than asked. Step 2 removes them. Neither step is optional:

| Missing step | Consequence |
| --- | --- |
| No bounding box | Every proximity search reads every donor row |
| No Haversine | Donors up to 1.41 × the radius away are reported as "in range" |

`services/geo.js` holds both halves and imports nothing, so it is pure and unit-tested.

### The bounding box is exact, not approximate

The obvious longitude half-width, `latDelta / cos(lat)`, is very slightly **too narrow** —
the easternmost point of a circle on a sphere does not sit at the centre's latitude. It is
millimetres at these radii, but wrong in the dangerous direction: a donor exactly on the
boundary would be filtered out by the index and no later step could recover them.
`boundingBox` uses `asin(sin(r/R) / cos(lat))` instead, which is exact for a sphere.

`tests/geo.test.js` asserts both directions of the property: the box contains every point
on the true circle (generated with a spherical destination formula, not a flat-earth
approximation), and it is tight enough that the circle reaches all four edges.

Poles and the antimeridian are handled — `coversAllLongitudes` and `wrapsAntimeridian` —
not because Odisha needs it, but because the failure mode is a query that silently returns
nothing.

---

## 2. Blood group compatibility

`services/matching.js` derives the compatibility table from antigens rather than writing
out an 8 × 8 grid, because a hand-typed grid is one typo away from telling a patient that
O+ is safe for an O- recipient.

> A donor can give to a recipient when **every antigen the donor carries is also present in
> the recipient**.

That single rule produces the familiar results: O- gives to everyone, AB+ receives from
everyone, and Rh-positive blood never goes to an Rh-negative patient.

```js
canDonate('O_NEG', 'AB_POS')   // true
canDonate('AB_POS', 'O_NEG')   // false  — compatibility is not symmetric
donorGroupsFor('A_POS')        // ['O_NEG', 'O_POS', 'A_NEG', 'A_POS']
```

`tests/matching.test.js` checks the derivation against a hand-written transfusion chart, so
the two are genuinely independent. If they ever disagree, the chart wins.

**Search defaults to an exact group; matching is always compatibility-aware.** Someone
browsing for "B+" usually means B+. A live request means "anyone whose blood is safe for
this patient", and narrowing that would cost lives at the margin. Search opts in with
`?compatible=true`.

---

## 3. `GET /donors/search`

Requires a signed-in caller of any role — donor records are personal data.

| Parameter | Notes |
| --- | --- |
| `bloodGroup` | `A_POS` or `A+`; both spellings accepted |
| `compatible` | `true` widens to every group that can donate to `bloodGroup`. Default `false` |
| `state`, `district`, `city` | Case-insensitive exact match |
| `lat` / `lng` (or `latitude` / `longitude`) | All-or-nothing |
| `radiusKm` | Needs a position. Defaults to `SEARCH_DEFAULT_RADIUS_KM` (25) |
| `availableOnly` | Default **`true`** — a donor who switched themselves off is not a search result, they are a person who asked not to be called |
| `page`, `pageSize` | `pageSize` capped at `SEARCH_MAX_PAGE_SIZE` |

Response:

```jsonc
{
  "results": [ { "userId": "...", "name": "...", "phone": "+91…", "bloodGroup": "O_POS",
                 "bloodGroupLabel": "O positive", "city": "Bhubaneswar", "distanceKm": 3.2 } ],
  "page": 1, "pageSize": 20, "total": 14, "hasMore": false,
  "mode": "proximity",        // or "area"
  "radiusKm": 25,
  "truncated": false,         // true = the row cap was hit; narrow the radius
  "filters": { "compatibleGroups": ["O_NEG", "O_POS"], ... },
  "message": "14 donors found."
}
```

`message` exists so the mobile screen can announce the outcome. A screen-reader user gets no
visual cue that the list under the button changed, and "14" on its own is not a sentence.

### What a searcher is allowed to see

| Field | App user | Staff |
| --- | --- | --- |
| Name, blood group, city/district/state, `distanceKm` | yes | yes |
| Phone | yes — the card has a Call button | yes |
| Street address, PIN code, exact `latitude`/`longitude`, account status | **no** | yes |

A distance is enough to decide who to ring. Publishing where someone lives to anyone who can
type a blood group is a different product. Phase 15 revisits this with the rest of the PII
rules.

### `truncated`

A proximity search reads at most `SEARCH_MAX_CANDIDATE_ROWS` (2000) bounding-box survivors
before measuring them. If it hits that cap, `truncated: true` says so rather than quietly
reporting a partial count as the total. It is the one way this design can hurt the database,
so it is bounded and visible.

---

## 4. Blood requests

| Route | Who |
| --- | --- |
| `POST /requests` | `REQUEST_CREATOR_ROLES` — RECEIVER, DONOR, STAFF, ADMIN |
| `GET /requests` | `scope=mine` (default), `scope=matched`, `scope=all` (staff only) |
| `GET /requests/:id` | Requester, matched donors, staff. Anyone else gets 403 |
| `PATCH /requests/:id/status` | Requester or staff |
| `GET /requests/:id/matches` | Requester or staff — the call worklist |
| `POST /requests/:id/matches/:donorId/respond` | Only that donor |

**On DONOR being allowed to post.** The phase brief says "RECEIVER or STAFF". Phase 3
deliberately does *not* demote a registered donor who later fills in the receiver form —
donors need blood too, and flipping their role would drop them out of every search. With a
strict RECEIVER-only gate those users could never ask for blood. `REQUEST_CREATOR_ROLES` in
`services/requestService.js` is the one place to change if you want the stricter reading.

**Visibility of contact details.** `hospitalName` and `contactPhone` are the operational
payload of a request. They go to the requester, to staff, and to a matched donor — and to a
donor only once they **accept**. A stranger listing requests sees where and what, never who
to ring.

**Expiry.** Default 24 h (`REQUEST_DEFAULT_EXPIRY_HOURS`), maximum 14 days. A request past
its expiry reports `status: "EXPIRED"` and stops accepting answers without anything having
to rewrite the row; `storedStatus` still shows what is in the database, so a client can tell
"expired on its own" from "closed by staff".

**Responses.** A donor may change an earlier answer. Circumstances change between accepting
and arriving, and a donor who quietly cannot come is worse than one who says so. Staff never
record a response on a donor's behalf — they write a `CallLog` instead (Phase 6), so the two
sources of truth never get confused with each other.

---

## 5. The matching engine

Runs inline on `POST /requests`. The receiver is standing in a hospital corridor and the
response is what tells them whether anyone was found; a handful of indexed reads and one
`createMany` is worth that certainty. If it ever needs to move to a queue, the seam is
`createMatchesForRequest` — the request row is already committed by then.

### Radius strategy (default)

```
5 km  → 20 candidates?  no, 3 found
10 km → 20 candidates?  no, 12 found
25 km → 20 candidates?  yes, 34 found  →  stop, insert 34 RequestMatch rows
```

It stops at the **first** radius that reaches `MATCH_MIN_CANDIDATES`, so a dense city
notifies the neighbourhood rather than the whole district. If no radius reaches the minimum
it returns the widest result it got — some donors an hour away beat none at all. The result
is capped at `MATCH_MAX_CANDIDATES` (100), because the last step can overshoot badly and in
Phase 5 every match becomes a push notification.

The escalation policy is a pure function, `expandingRadiusSearch({ radii, minCandidates,
search })`. `search(radiusKm)` is injected: the engine passes a Postgres query, the tests
pass a fake, and no mocking framework is involved.

The response echoes the walk back, so staff can see the request only had to reach 10 km:

```jsonc
"matching": {
  "strategy": "radius", "radiusKm": 25, "reachedMinimum": true, "matchedCount": 34,
  "steps": [ { "radiusKm": 5, "found": 3 }, { "radiusKm": 10, "found": 12 },
             { "radiusKm": 25, "found": 34 } ]
}
```

### Area strategy (fallback)

Used when `MATCH_STRATEGY=area`, and **always** when the request has no coordinates —
there is nothing to measure from. Matches on the request's district, widening to the state
if the district is too thin.

Area matches store `distanceKm: null`, which is why the column is nullable. Zero would be a
lie that sorts those donors to the top of the call list. `ORDER BY distanceKm ASC` puts
NULLs last in Postgres by default, which is exactly right.

### Who is a candidate

Identical to search, deliberately, so a donor can never be notified about a request they
would not have appeared in search for:

- `User.status = ACTIVE` — this is what makes the CRM's mark-dead action work. One column
  change removes a donor from search *and* from every future notification.
- `DonorProfile.isAvailable = true`
- Blood group compatible with the request
- Not the requester

### Idempotence

`RequestMatch` has a unique `(requestId, donorUserId)`. Re-running the engine on the same
request adds only donors who were not matched before, so a widening re-match never
re-notifies anyone, and existing rows keep their original distance and response.

---

## 6. Configuration

```bash
MATCH_STRATEGY=radius          # or "area"
MATCH_RADII_KM=5,10,25,50      # walked smallest-first, whatever order you write them in
MATCH_MIN_CANDIDATES=20
MATCH_MAX_CANDIDATES=100
REQUEST_DEFAULT_EXPIRY_HOURS=24
REQUEST_MAX_EXPIRY_HOURS=336
SEARCH_DEFAULT_PAGE_SIZE=20
SEARCH_MAX_PAGE_SIZE=100
SEARCH_DEFAULT_RADIUS_KM=25
SEARCH_MAX_RADIUS_KM=500
SEARCH_MAX_CANDIDATE_ROWS=2000
```

---

## 7. Testing

```bash
npm test --workspace backend             # 52 unit tests, no database needed
npm run smoke:requests --workspace backend   # end to end, needs a seeded DB and a running server
```

The unit tests import only `services/geo.js` and `services/matching.js` — no Prisma, no env,
no database — which is why those two modules were kept free of imports. Phase 15 adds
integration tests that boot the app.

The smoke script needs `SMS_PROVIDER=console` and a seeded database. It creates one
throwaway receiver and one request and deletes both; seeded donors are only read from.

### A note on the seed

Both `DISTRICTS` and `BLOOD_GROUPS` have eight entries, so the original `i % 8` for each gave
every donor in a district the same blood group — and a search for B+ near Bhubaneswar would
find nobody for reasons that had nothing to do with the code. The seed now adds the lap
number to decorrelate the two cycles, and stays fully deterministic. Re-seed if your database
predates this: `npm run db:seed --workspace backend`.

With 30 donors across 8 districts nothing ever reaches `MATCH_MIN_CANDIDATES=20`, so seeded
requests always walk all four radii and report `reachedMinimum: false`. That is the expansion
logic working, not failing.
