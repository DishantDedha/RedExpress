# crm — Red Express staff dashboard

Next.js 16 App Router, **plain JavaScript — no TypeScript**. Used by STAFF and ADMIN to search
users, work a calling worklist, and retire unreachable donors.

Phase 12 built the shell: layout, staff auth, session handling, role guard, and the
loading/error/toast patterns every later page reuses. Phase 13 added the read surface — the
dashboard numbers, people search, person detail, blood requests and the calling worklist.
Phase 14 added the actions on those rows: call outcomes, marking a donor unreachable, and the
ADMIN-only reactivate.

## The calling workflow

Everything a staff member does to a record goes through a server action in
`lib/actions/crm.js`, so the access token stays in an httpOnly cookie and never enters client
JavaScript. None of them throw at the caller — each returns `{ ok, message }`, because the
honest response to "no answer was not recorded" is a toast next to the button, not an error
page that loses someone's place in a worklist of forty names.

| Control | Action | Backend |
| --- | --- | --- |
| Picked up / No answer / Wrong number | `recordCallAction` | `POST /crm/call-logs` |
| Mark as unreachable | `markDeadAction` | `POST /crm/donors/:id/mark-dead` |
| Reactivate (ADMIN only) | `reactivateAction` | `POST /crm/donors/:id/reactivate` |
| Recent calls, expanded on a row | `donorCallHistoryAction` | `GET /crm/call-logs` |

- **The confirmation is the feature.** `ConfirmDialog` is a native `<dialog>` opened with
  `showModal()` — focus trapped, background inert, Escape closes, focus returns to the trigger.
  It spells out all three consequences (out of search, no alerts, signed out everywhere) rather
  than summarising them, focus lands on Cancel rather than Confirm, and Escape is suppressed
  while the request is in flight so nobody is left unsure whether it went through.
- **Failures stay in the dialog.** Closing it and dropping a toast would lose the typed note.
- **Live rows.** `WorklistTable` keeps an override layer keyed by donor id, so a marked donor's
  badge flips to Dead and the action becomes Reactivate immediately. Sort order is *not*
  recomputed — a row that jumps or vanishes under someone working down a list is how names get
  skipped. The action also revalidates, so the optimistic layer and the server converge.
- **Attempts before the decision.** Every row shows the last call and expands to the recent
  history in place, loaded on demand. Making staff leave the worklist to check is how a donor
  gets marked dead after one missed call.
- **The role split is stated three times and enforced once.** `lib/roles.js` hides the button,
  the server action re-checks, and the backend's `requireRole('ADMIN')` is what actually
  refuses. For STAFF the reactivate control is a sentence explaining the rule, not a disabled
  button that reads as broken.

`LifecycleLegend` sits on the worklist and on every person's page. It is the one place that
says, in plain words, that "dead" means unreachable rather than deceased — and that a donor who
signs back in returns to **active but still not available**, which is otherwise the thing staff
phone up about.

## Pages

| Route | What it is | Backend |
| --- | --- | --- |
| `/dashboard` | Stat tiles, donors by blood group, recent open requests | `/crm/stats`, `/requests?scope=all&status=OPEN` |
| `/dashboard/users` | People search — one box across name, phone and email, plus role/status/blood group/area filters | `/crm/users/search` |
| `/dashboard/users/[userId]` | One person: profile, location, every call, every request they were asked about, status history | `/crm/users/:id` |
| `/dashboard/requests` | Every blood request, most urgent first | `/requests?scope=all` |
| `/dashboard/requests/[requestId]` | The request, plus the calling worklist — nearby donors, nearest first | `/crm/donors/nearby?requestId=` |

Three things about this surface are deliberate:

- **Filters live in the URL, not in component state.** Every filter bar is a plain GET `<form>`
  (`components/ui/FilterBar.js`). Submitting navigates; the server component re-renders. That
  means a search is bookmarkable and pasteable ("open critical requests in Cuttack"), Back
  works, paging costs no JavaScript, and a screen-reader user fills a form and presses Enter
  instead of fighting results that reshuffle on every keystroke. Changing a filter drops
  `page`, or narrowing a search from page 4 shows an empty table.
- **The worklist says where it came from.** `/crm/donors/nearby` normally returns the
  `RequestMatch` rows written when the request was posted — the same people who got the push,
  in the same order, distances frozen so the list does not reshuffle under someone working down
  it. When a request has no matches the backend re-runs the engine in preview mode and reports
  `source: 'preview'`; the page shows that as a banner rather than passing "nearby now" off as
  "was notified". Those are different phone calls.
- **No embedded maps.** `LocationPanel` prints the area, the coordinates, and an opt-in link.
  An embedded tile layer would ship a donor's home coordinates to a third-party map server on
  every page view, for every donor anyone happens to open.

## Run it

```bash
# 1. Backend and PostgreSQL must be up first — see backend/README.md
npm run dev:backend        # http://localhost:4000

# 2. Dashboard
npm run dev:crm            # http://localhost:3000
```

Sign in with the seeded accounts (`npm run db:seed --workspace backend`):

| Account | Email | Password |
| --- | --- | --- |
| ADMIN | `admin@redexpress.local` | `SEED_ADMIN_PASSWORD` from `backend/.env` |
| STAFF | `staff1@redexpress.local` | `SEED_STAFF_PASSWORD` from `backend/.env` |

## Config

`crm/.env.local`, from the `[crm]` block of the root `.env.example`:

| Variable | Purpose |
| --- | --- |
| `BACKEND_API_BASE_URL` | Where the API lives. **Unprefixed on purpose** — only `NEXT_PUBLIC_*` reaches the browser, and the browser has no business calling the API directly. |
| `NEXT_PUBLIC_APP_URL` | The CRM's own origin. Must also appear in the backend's `CORS_ORIGINS`. |
| `CRM_COOKIE_SECURE` | `true` behind HTTPS. Over plain http a `Secure` cookie is never sent back, which looks exactly like a broken login — hence a separate flag rather than keying off `NODE_ENV`. |
| `CRM_SESSION_SECRET` | Reserved for the CSRF token added in Phase 15. |

## How auth works

```
browser ──POST /api/auth/login──▶ Next route handler ──POST /auth/staff/login──▶ backend
                                        │
                                        └── Set-Cookie: re_access (httpOnly), re_refresh (httpOnly)
```

The token exchange happens **server-side**, so no access or refresh token ever exists in client
JavaScript — one XSS away from an attacker reading every donor's phone number and address is
not a risk worth taking for the convenience of `localStorage`.

Three moving parts:

- **`proxy.js`** (Next 16's replacement for `middleware.js` — the old name still works but warns
  at build time) gates `/dashboard/*` and refreshes the access token. The access cookie is set
  to expire slightly *before* its token does, so "no access cookie, refresh cookie present" is
  the ordinary signal that a 15-minute token aged out. The proxy trades it for a new one, and a
  staff member three hours into a calling list never gets bounced to `/login`.
- **`lib/session.js`** asks the backend who the cookie holder actually is, on every request,
  through React `cache()` so a page only pays for it once. This is deliberate: decoding the JWT
  locally would be faster and would trust a token the backend may have already invalidated.
  The `tokenVersion` mechanism (`backend/docs/auth.md`) exists precisely so a revoked session
  dies at the next call.
- **`lib/roles.js`** decides what the UI *shows*. It is not authorization — the backend's
  `requireRole()` on `/crm` is, and hiding a button only prevents mistakes.

What happens when things go wrong, and why:

| Situation | Result |
| --- | --- |
| No cookies | `/login?reason=required`, with the requested path in `?next=` so sign-in lands where they were going |
| Access token aged out, refresh good | Refreshed silently; the staff member notices nothing |
| Refresh rejected (tokenVersion bumped, secrets rotated) | Cookies cleared → `/login?reason=expired` |
| Backend unreachable | Cookies **kept** → `/login?reason=unavailable`. A thirty-second API restart must not sign the whole office out |
| Donor/receiver token presented | Rejected by the layout — a non-staff token never renders a dashboard, even an empty one |

## Accessibility

Staff rely on assistive tech too, and a dashboard is where accessibility is most often skipped
on the assumption that "internal tools don't need it".

- The palette is copied from `mobile/theme/index.js`, contrast measurements and all — every
  text pair clears WCAG AA 4.5:1, every control outline and the focus ring clear 3:1.
- One focus ring, defined once in `globals.css`, and never removed. `:focus-visible`, so a Tab
  always draws it and a mouse click does not.
- A skip link is the first tab stop on every dashboard page; `<main>` carries `tabIndex={-1}`
  so it can receive that focus.
- Toasts use two live regions — polite for success, assertive for errors — both present from
  first render, because a live region created at the same moment as its message is often not
  announced at all. Errors do not auto-dismiss.
- Status is a **word** (`Active` / `Dead` / `Blocked`) with a distinct shape, not a colour dot.
  Colour is the redundant signal, never the only one.
- Form fields have real `<label>`s, never placeholder-as-label, with errors linked via
  `aria-describedby` and `aria-invalid`.
- Interactive targets are at least 44px tall; `viewport` sets no `maximum-scale`, so pinch and
  browser zoom both work.

Added with the tables in Phase 13:

- Real `<table>` markup with a `<caption>`, `scope="col"` headers and the name cell as a
  `scope="row"` header, so a screen reader repeats "Anita Sahu" as context while arrowing
  across a row instead of reading nine values belonging to nobody. The scroll container is
  focusable and labelled — a scrollable region unreachable by keyboard is the usual place
  WCAG 2.1.1 is failed.
- Blood groups are shown short and read long: `O-` is hidden from the accessibility tree and
  "O negative" supplied beside it, because a screen reader reads `O-` as "O" or "O dash" and
  the difference between O positive and O negative is the entire product.
- Phone numbers get a digit-spaced accessible name, so `+919876500001` is read one digit at a
  time rather than as a number in the billions.
- Result counts are announced (`role="status"`), because a GET form that navigates gives a
  screen-reader user no other signal that the table changed.
- Nothing renders as an empty cell. "Never called" and "Not recorded" are stated outright — in
  a calling worklist, the gap between "nobody has tried" and "the column failed to load" is
  what staff decide the next call on.
- Paging is links, not buttons; the unavailable direction is `aria-disabled` text, out of the
  tab order but still in the reading order.

## Layout

```
app/
  layout.js               Root: fonts, ToastProvider (above the router, so a message
                          survives the navigation that produced it)
  page.js                 '/' → /dashboard
  error.js                Top-level boundary. Also catches dashboard *layout* errors —
  not-found.js            a layout's failures are caught by its parent, not by itself
  login/
    page.js               Server component; reads ?reason= and ?next=
    LoginForm.js          Client form → /api/auth/login
  dashboard/
    layout.js             Session check, sidebar/topbar shell, skip link
    page.js               Dashboard home: stats, donors by group, recent open requests
    loading.js            Announced skeleton
    error.js              Segment error boundary with a retry
    not-found.js          A deleted record, rendered inside the shell
    users/
      page.js             People search + filters + paginated table
      [userId]/page.js    One person: profile, calls, matches, status history
    requests/
      page.js             All blood requests
      [requestId]/page.js Request detail + the calling worklist
  api/auth/
    login/route.js        Token exchange → httpOnly cookies
    logout/route.js       Clears cookies (programmatic path)
components/
  Sidebar.js              Nav list — every entry lives in the one array here
  Topbar.js               Identity + sign-out (server action, works without JS)
  SessionProvider.js      useSession() for client components
  ToastProvider.js        useToast(): success / error / info
  CallHistory.js          Call log list + the "last call" table cell
  worklist/
    WorklistTable.js      The calling list, with live per-row status
    DonorActions.js       Outcome buttons, mark-dead, reactivate
    DonorRecordPanel.js   The same actions on a person's own page
    CallHistoryDisclosure.js  Last call, with the rest one keypress away
    LifecycleLegend.js    What Active / Dead / Blocked mean
  ui/                     Button, Field, Card, PageHeader, States, StatusBadge, Badge,
                          DataTable, FilterBar, Pagination, StatTile, DetailList,
                          BloodGroup, PhoneLink, LocationPanel, ConfirmDialog
lib/
  api.js                  The only place that talks to the backend
  session.js              getSession / requireSession / apiGet
  session-cookies.js      Cookie names and options; dependency-free (the proxy imports it)
  roles.js                canMarkDead / canReactivate
  constants.js            The backend's enums, with the words staff read
  actions/crm.js          Call outcomes, mark-dead, reactivate — the mutating server actions
  format.js               Dates, distances, phones — fixed locale and time zone, so server
                          and browser render the same string
  actions/auth.js         logoutAction
proxy.js                  Route gate + silent token refresh
```

`AGENTS.md` and `CLAUDE.md` in this folder are generated and refreshed by `next dev` itself;
they are meant to be committed.
