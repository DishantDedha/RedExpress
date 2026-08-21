# mobile — Red Express app

React Native + Expo SDK 57 (Expo Router), plain JavaScript. Donor and receiver app.

**Phases 7–11 are built.** The shell and accessible component kit (7), the OTP sign-in flow
(8), registration and profile (9), donor search, blood requests and push notifications (10),
and the deep accessibility hardening pass (11).

> **[docs/accessibility.md](docs/accessibility.md)** is the accessibility record: the Phase 11
> audit and what it fixed, how voice guidance / big text / high contrast work, the full manual
> TalkBack and VoiceOver test steps, and the known gaps. Read it before changing anything in
> `components/`.

---

## Run it

```bash
cp ../.env.example .env          # keep the [mobile] section
npm run start --workspace mobile # or: npm run dev:mobile from the repo root
```

Then press `a` for Android, `i` for iOS, or scan the QR code with Expo Go.

`EXPO_PUBLIC_API_BASE_URL` must be reachable **from the device**. `localhost` refers to the
phone itself, so:

| Where you are running | Value |
| --- | --- |
| iOS simulator | `http://localhost:4000` |
| Android emulator | `http://10.0.2.2:4000` |
| Physical device | `http://<your-machine's-LAN-IP>:4000` |

Only `EXPO_PUBLIC_*` variables reach the bundle, and everything that does is **public** —
readable by anyone who has the app. Never put a secret there.

Start the backend first (`npm run dev:backend`).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run start` | Expo dev server |
| `npm run android` / `npm run ios` | Dev server, opening that platform |
| `npm run verify:contrast` | **Fails the build if any theme colour pair drops below WCAG AA.** |
| `npm run doctor` | Expo's dependency/config check |

---

## Layout

```
mobile/
  app/                        Expo Router routes (file-based)
    _layout.js                root stack + the forced-sign-out listener
    index.js                  Landing (mockup 1)
    demo.js                   the component kit, on one screen
    (auth)/                   login · register · phone · otp · donor-form · receiver-form
    (app)/                    the signed-in stack, behind the token guard
      (tabs)/                 home · find-donors · notifications · profile — the bottom bar
      post-request.js         pushed over the tabs, with a back button
      settings.js             accessibility preferences
      privacy.js              what we know about you, and who can see it
      requests/[id].js        request detail and respond — what a notification opens
  components/                 the accessible component kit
  data/                       blood groups, and Odisha state/district/city
  hooks/                      screen-reader focus and detection · notification routing ·
                              accessibility preferences · voice guidance
  services/                   apiClient · auth · profile · donors · requests · notifications ·
                              push · session · location · tokenStorage · sessionEvents ·
                              config · feedback · preferences · voiceGuidance · voiceInput
  utils/phone.js              validation, display formatting, and speech formatting
  utils/call.js               tel: links, with every failure announced
  utils/form.js               ordered validation, and "announce + focus the first error"
  theme/index.js              every colour, space and size in the app
  scripts/check-contrast.mjs  the WCAG gate
  docs/accessibility.md       the audit, the manual test steps, and the known gaps
```

Phase 7 built the shell, the theme and the component kit; Phase 8 built the sign-in flow;
Phase 9 built registration and the profile; Phase 10 built search, requests and push; Phase 11
hardened all of it for blind and low-vision users.

### Navigation

Mirrors the mockups. `(auth)` and `(app)` are route *groups* — the parentheses mean the folder
adds no URL segment, so the paths are `/login`, `/register`, `/phone` and so on.

```
Landing ──▶ Phone (login) ──────▶ OTP ──┬─▶ Home            profile already complete
        │                               └─▶ Donor form      profile unfinished
        └─▶ Register ──▶ type ─▶ Phone ──▶ OTP ──▶ Donor form       (mockups 6, 11)
                         │                         Find blood form  (mockup 7)
                         └────────────────────────▶

Home ──┬─▶ Profile          view · edit · availability · last donation date
       ├─▶ Find donors     search → results → Call
       ├─▶ Request blood   post → Request detail (donors being alerted)
       └─▶ Your alerts ────▶ Request detail ──▶ Accept / Decline

                  push notification tap ───────▲
```

Phone and OTP are one shared pair taking `mode` and `role` parameters, not two near-copies.
The OTP screen is the most delicate accessibility surface in the app, and it should only have
to be got right once.

`/login` is a redirect onto `/phone` in login mode. Mockup 5 makes it plain that signing in
*is* entering a phone number, so there is no separate screen — but the route name stays, because
the forced-sign-out path and Phase 10's route guard both point at it.

**Each route group owns its header.** `(auth)` and `(app)` are Stacks nested inside the root
Stack; with a header on both, every screen renders two of them, and a screen-reader user meets
two identical back buttons in a row. The root sets `headerShown: false` for both groups.

**`(app)` is guarded.** Its layout checks for a stored token and redirects to `/login` without
one. It deliberately does not check whether the token is still *valid* — that would cost a
round trip before the first paint, and `apiClient` already handles a rejected token by wiping
the session and routing to sign-in with a spoken explanation.

### Theme

One file: [`theme/index.js`](theme/index.js). Screens never hard-code a colour or a size.

The palette is **verified, not eyeballed**. `npm run verify:contrast` reads the real tokens out
of the theme and checks all 67 foreground/background pairs the UI renders against WCAG 2.1 —
4.5:1 for text, 3:1 for input outlines and focus rings, and **7:1 (AAA) for every pair the
high-contrast preference substitutes in** — and exits non-zero on a failure. It caught one
during Phase 7: the input border passed at 3.15:1 on a white card but fell to 2.95:1 on the
grey screen background, where forms outside a card actually sit.

**Two surfaces, two foreground sets.** The app surface is light with dark text. The other is
red, and the entire light-surface set — `text`, `textMuted`, `border`, `focusRing` — is
unreadable on it. There, use `colors.onPrimary` for anything that matters and
`colors.onBrandMuted` (6.32:1 on `brand`, 5.44:1 on the lightest gradient stop) for supporting
copy. The surface is chosen by a prop rather than a per-screen style block precisely so a
screen cannot end up red with dark body text on it.

**Where the red actually is.** Every screen used to be red edge to edge before sign-in. Now the
red is a *band*: `<Screen hero={…}>` paints a gradient across the top carrying the screen's
title, and everything below it sits on a white sheet with rounded top corners. Everything a
user has to read, fill in or scan is on white; the brand owns the band.

That is a legibility decision as much as a visual one. A text input on a saturated background
has to invert its outline, its label, its helper text and its error state, and every one of
those is a pair somebody has to measure — which is why the old "Send OTP" button had to be
inverted to white (see below). On white, a field is the same field as everywhere else.

The gradient is drawn by `<Gradient/>` as stacked bands rather than by a native dependency, and
its *stops* are what the contrast script checks — not an average, which would say nothing about
the light end where the ratio is worst.

### The component kit

`components/index.js` is the entry point. **Screens import from the kit, not from
`react-native`.** That is the whole strategy: accessibility is solved once, here, and every
screen in Phases 8–11 inherits it rather than being audited and patched one at a time.

| Component | What it guarantees |
| --- | --- |
| `AppText` | Font scaling stays on (capped at 2×); heading variants get `accessibilityRole="header"`, so rotor navigation works. Also the single point where **big text** and **high contrast** are applied |
| `AppButton` | `role="button"`, `accessibilityState` for disabled/busy, 48dp minimum, label kept visible while loading |
| `AppTextInput` | **Visible label, not a placeholder**; errors announced *and* folded into the accessible name; `focusAll()` for "jump to the first invalid field" |
| `AppSelect` | `role="combobox"` reporting its current value; options are radio buttons with a checked state and "item 4 of 8" position; focus returns to the trigger on close |
| `OtpInput` | **Six boxes, one field.** SMS autofill works, the reader announces one coherent "Verification code" field, and digits are read back one at a time |
| `AppCheckbox` | `role="checkbox"` with a real `checked` state; the whole row is the target, and the tick is never the only signal |
| `AppSwitch` | **The whole row is the control** — one focus stop, `role="switch"`, 48dp full-width target, with the state **written out in words** so it survives greyscale |
| `AppDateInput` | Day / Month / Year as three labelled fields — no picker wheel, **no auto-advance** |
| `PhotoPicker` | Every outcome stated and announced: selected, cancelled, too large, removed; the preview image is hidden as decoration |
| `LocationCapture` | The permission rationale next to the button that triggers it; granted, denied, blocked and failed each announce and say what happens instead |
| `BrandMark` | The logo, drawn rather than bitmapped; decorative parts hidden, and it can *be* the screen heading rather than competing with one |
| `ScreenHeader` | Moves screen-reader focus to the heading on every screen entry — built in, so it cannot be forgotten |
| `Card` | Optional `grouped` mode so a result announces as one phrase instead of four fragments; `onPress` makes it a real button |
| `DonorCard` | A search result as **two** stops — one spoken summary, one Call button — not six fragments per donor |
| `PushConsent` | The notification rationale *before* the one-shot OS prompt; renders nothing once alerts are on |
| `DictationButton` | Speak a field instead of typing it. Renders **nothing at all** unless the optional native module is installed and the user has switched dictation on |
| `Screen` | Safe areas, keyboard avoidance, and scrolling — so a form still works at 200% text size. Also the red hero band and the white sheet under it |
| `LiveMessage` | Announces async events ("3 donors found") **and** renders them |
| `Gradient` | The brand ramp, stacked from plain `View`s. Hides itself from the accessibility tree, and flattens to one dark fill under high contrast |
| `Icon` | Twelve glyphs drawn from `View`s — no font, so **nothing a screen reader can try to pronounce**. Decorative unconditionally; there is no prop to change that |
| `Chip` | A labelled pill. Every tone carries a word, never a colour alone |
| `ActionTile` | A large labelled button with an icon and a description — one focus stop, the description as its hint. What replaced the column of identical buttons on Home |
| `Avatar` | Initials in a circle. Decorative and hidden; the **one** place in the app that turns font scaling off, and only because it scales the whole circle by hand instead |
| `SectionHeading` | A real `header` role above each group, so a long screen is navigable by rotor rather than only by swiping |

Two decisions worth knowing before you extend this:

**Placeholders are never field names.** The mockups put the field name in the placeholder.
That text vanishes the moment you type, is usually below 4.5:1, and some screen readers read
it as though it were the field's value. `AppTextInput` always renders a visible label;
`placeholder` is for an *example* (`9876543210`).

**Announcements use one mechanism per platform.** Android has `accessibilityLiveRegion`, which
TalkBack reads automatically. iOS ignores it entirely and needs
`AccessibilityInfo.announceForAccessibility`. Using both on Android makes TalkBack say
everything twice, so `LiveMessage` picks exactly one per platform. Keep that split if you add
anything that speaks.

### API client and forced sign-out

`services/apiClient.js` attaches the bearer token, refreshes it once on an ordinary 401, and
converts the backend's `{ error: { code, message, fields } }` envelope into a typed `ApiError`.

It also implements the mobile half of the **dead-donor lifecycle**:

1. CRM staff cannot reach a donor by phone and press *Mark as unreachable* (Phase 6).
2. The backend sets `status = DEAD` and increments `User.tokenVersion`.
3. Every token the donor holds carries the old `tokenVersion`, so their next request returns
   `401 TOKEN_VERSION_MISMATCH`.
4. The client wipes secure storage and emits a session-ended event. **It does not retry the
   refresh** — the refresh token carries the same stale version and would be rejected too.
5. `app/_layout.js` announces what happened and routes to `/login` with the reason attached,
   so the user is *told*, not silently dumped at a sign-in screen.
6. Signing in again with an OTP flips them `DEAD → ACTIVE` (Phase 2). Re-login is the
   proof-of-life the whole mechanism is asking for, not a punishment — the login screen says so.

Tokens live in `expo-secure-store` only (Keychain / Android Keystore), never AsyncStorage.
On web there is no secure store, so tokens are held in memory and a refresh signs you out —
deliberate, rather than silently falling back to `localStorage`.

---

## What Phase 8 built: the sign-in flow

Landing (mockup 1) → *Join Red Express* (mockup 2) → mobile number (mockups 5, 9) → verify
(mockups 4, 10), against `POST /auth/otp/request` and `POST /auth/otp/verify`.

### The six-box code field is one text input

This is the decision the phase exists for. The obvious build — six one-character inputs that
auto-advance — looks exactly like the mockup and is close to unusable without sight:

- a reader announces **six anonymous "edit text" fields**, none of which says what the group is;
- focus jumps on every keystroke, cutting the reader off mid-word, six times;
- **SMS autofill hands the whole code to the first field**, which keeps one digit and drops the
  rest — the one feature that makes an OTP bearable stops working;
- checking what you typed means visiting six fields to collect six digits.

So [`components/OtpInput.js`](components/OtpInput.js) is a single `TextInput` with
`textContentType="oneTimeCode"` (iOS) and `autoComplete="sms-otp"` (Android), stretched over six
decorative boxes that are hidden from the accessibility tree. The input is invisible via
`color: 'transparent'`, **not** `opacity: 0` — UIKit drops any view with an alpha of 0 from the
accessibility tree, so VoiceOver would find no field at all. `accessibilityValue.text` is the
digits spaced apart, because "4071" is otherwise read as *four thousand and seventy-one*.

### Auto-submit is conditional on the screen reader

With no reader, the sixth digit submits. With a reader, only the Submit button does.

A blind user reviews a code *after* typing it, by swiping back to hear it. Auto-submit fires
during that review — the screen changes underneath them, or a mistyped code is spent before they
could catch it. `AccessibilityInfo.isScreenReaderEnabled` decides, and the same signal governs
auto-focus: the field is focused on mount (which is what makes iOS offer the code above the
keyboard) *unless* a reader is running, in which case the heading keeps focus so the user is told
where they are before being dropped into a text field.

### The resend countdown never nags

A disabled *Resend* with a silently ticking timer is a dead end: the button says "dimmed" and
nothing explains when it will work. So the remaining time is drawn on screen, folded into the
button's own label ("Resend code, available in 24 seconds"), and announced **once**, when the
wait ends. It is deliberately *not* a live region — that would announce all thirty ticks.

### Phone numbers are spoken digit by digit

`utils/phone.js` has `formatPhoneForSpeech`: `+917008617451` → `plus 9 1 7 0 0 8 …`. Announced
raw, a reader says it as one enormous quantity, which cannot be checked against the phone in your
hand. Visible text stays grouped (`+91 70086 17451`); only what is *spoken* is separated.

Client-side validation deliberately mirrors `backend/src/utils/phone.js` exactly. Looser rules
here would mean telling the user a number is fine and then having the server disagree.

### Two smaller ones

- **The mockup's dark-red "Send OTP" button is not what shipped.** `#8C0019` on `#B00020` is
  1.34:1, so the button's *edge* — the thing you must see to know a control is there — fails WCAG
  1.4.11. `AppButton variant="brand"` inverts it to a white fill with a red label at 7.33:1,
  which is how mockup 1 already draws its own buttons.
- **All-caps text is given a sentence-case label.** Both readers tend to spell short all-caps
  strings out letter by letter, so `EMERGENCY BLOOD HELPLINE` and `WE4YOU` keep their capitals on
  screen and are spoken as "Emergency blood helpline" and "We4You".

### Running it end to end without an SMS gateway

Set `SMS_PROVIDER=console` on the backend. The code is printed to the backend log and returned as
`devCode`, which the verify screen shows on screen — guarded twice server-side so production
never returns it.

---

## What Phase 9 built: registration and profile

Donor registration (mockups 6, 11), the quick receiver form (mockup 7), and the profile screen,
against `POST /donors/register`, `POST /receivers/register`, `GET/PATCH /donors/me`,
`PATCH /donors/me/availability`, `PATCH /donors/me/last-donation` and `GET /me`.

### Errors are announced by name, not by count

The donor form has fourteen fields, and the usual way of reporting a failed submit — render
eleven red messages and announce "there are 11 errors" — tells a blind user that something is
wrong and nothing about where. They then swipe the entire form to find it.

`utils/form.js` runs the rules **in screen order** and announces the first problem by name:
*"There are 3 problems. Blood group. Choose a blood group."* Focus then moves to that control.
The move is deferred by 300ms, and that delay is load-bearing — every control folds its error
into its own accessible name, and that name does not exist until React has committed the error
state. Focusing in the same tick lands on the old name and the error is never read.

Server-side field errors take the same path, so a duplicate email lands on the email input
rather than in a banner the user has already scrolled past.

### Dependent selects announce that they changed

Choosing a district repopulates the city dropdown. A sighted user sees that happen; otherwise
it is silent, and the next thing you hear is a list you were not expecting. So changing a
district announces *"District set to Khordha. Now choose your city or town."*

Every district also offers **Other**, which reveals a free-text field. A dropdown that does not
contain your village and offers no way out is a wall, and it would be one for exactly the rural
donors the service most needs.

### A date is three fields, not a picker

`@react-native-community/datetimepicker` is the obvious choice and a poor one under a screen
reader: iOS gives VoiceOver a multi-column wheel with no way to type, and TalkBack's calendar
grid means swiping through weeks to reach a birth year forty years ago. `AppDateInput` is the
GOV.UK pattern instead — Day, Month, Year as three labelled number fields, each carrying the
group's name ("Date of birth, day"), with **no auto-advance**, which is the same bug as the
six-box OTP field. It also needs no native module, so it still works in Expo Go.

### Location: the rationale sits next to the button

The brief called for a permission rationale *screen*. It is a component instead
(`LocationCapture`), rendered directly above the button that triggers the prompt.

Navigating away mid-form to read a page costs the half-finished form's state, pushes a screen a
reader user then has to get out of, and separates the explanation from the decision by a screen
transition. Pre-permission priming works *because* the two are adjacent. The copy and
`services/location.js` would move to a screen unchanged if that turns out to be wrong.

The permission dialog is a one-shot resource — once denied, iOS never asks again — so nothing
prompts before the user has pressed a button that says what it will do. Denial is never fatal:
the typed address is geocoded server-side, and the confirmation after registering reports what
the server *actually* used (`locationSource`) rather than assuming.

### Read mode is a summary, not a disabled form

The profile screen shows plain labelled text until you press Edit. Rendering the form with
every input disabled — the common shortcut — gives a reader fourteen stops that each announce
"dimmed" and do nothing.

Availability and the last donation date sit **outside** the edit form with their own endpoints
and their own save buttons, because they are what a donor changes often and usually in a hurry.
The availability switch is optimistic but **rolls back** if the server refuses: a control
showing a state that was never saved is worse than one that visibly declined. Each announces
the consequence the server sends back — *"You are now shown as available to donate"* — not the
boolean.

### Two deviations from the mockups, both deliberate

- **"JPG, PNG, PDF" is shown as "JPG or PNG".** The backend accepts all three, but the app
  offers `expo-image-picker` only; pulling in a document picker so someone can submit a profile
  photo as a PDF would be dead weight. The copy says what the app can actually do rather than
  repeating the mockup and being wrong.
- **Blood groups read "A positive", not "A+".** A screen reader renders "+" as "plus" if you are
  lucky and skips it if you are not — and on this field, a one-syllable slip is a medical error.

### Native modules

`expo-image-picker` and `expo-location` were added this phase, with their permission strings in
`app.json`. Both work in Expo Go; **neither works on web**, so the photo and GPS paths must be
tested on a device.

---

## What Phase 10 built: search, requests, and the alert loop

The core loop, end to end: find donors (mockup 2), post a request, get told about one, answer
it. Against `GET /donors/search`, `POST /requests`, `GET /requests/:id`,
`POST /requests/:id/matches/:donorId/respond`, `POST /devices/register`,
`DELETE /devices/:token`, `GET /notifications` and `PATCH /notifications/:id/read`.

```
Donor A posts a request           Donor B's phone
  POST /requests                    ├─ push:  "Urgent: O negative blood needed nearby"
    └─ matching engine ─────────────┤          "Apollo Hospital, about 3 km away."
         RequestMatch rows          └─ tap ──▶ /requests/[id] ──▶ Accept ──▶ push back to A
```

### A result list appearing is silent

Pressing Search and having a list appear below the button changes nothing the user is focused
on, so a screen reader says **nothing at all**. Three things happen instead: the server's own
sentence is announced (*"3 donors found."*), the reader is moved to the results heading, and
the heading itself carries the count. The sentence comes from the backend rather than being
composed here, so what is spoken and what is drawn cannot drift apart.

Each result is then exactly two swipes — a summary and an action:

> *"Ravi Kumar. O positive. About 3 kilometres away. In Cuttack. Available to donate."*
> *"Call Ravi Kumar, 7 0 0 8 6 1 7 4 5 1, button."*

`Card grouped` is deliberately **not** used for this. `accessible` on a wrapper collapses the
whole subtree into one element, which would swallow the Call button along with the text. The
summary is the grouped part; the button is its sibling.

### The notification permission is asked once, so it is asked well

`requestPermissionsAsync` shows the OS dialog exactly once per install, and once someone
declines, neither platform will ever ask again. For a donor, declining means never hearing
that a patient two kilometres away needs their blood group — which is the entire product.

So nothing prompts on its own. `PushConsent` explains what the alerts are and what they are
not ("only when a patient near you needs your blood group... no other notifications"), and the
OS dialog appears only after a deliberate press. Same pre-permission priming as
`LocationCapture`. Every outcome — granted, denied, blocked, no hardware, Expo Go — is a
returned value with a spoken message, never an exception: a blind donor pressing *Turn on
alerts* gets no feedback at all from the OS dialog, and silence is indistinguishable from a
broken button.

Permission is re-read on every focus rather than cached, because it can be changed in Settings
while the app is backgrounded.

### Cold-start deep links are a separate code path

Tapping a notification has two implementations, and only one of them is obvious:

- **warm** — the app is running. `addNotificationResponseReceivedListener` fires on the tap.
- **cold** — the tap *launched* the app. No listener exists yet when the response is
  delivered, so it has to be pulled with `getLastNotificationResponseAsync` on mount.

Miss the second and tapping an alert from a killed app dumps the donor on the home screen with
no idea why their phone buzzed. It is the most common bug in push deep-linking and it is
invisible while developing, because the app is nearly always already running. Both paths go
through `hooks/useNotificationRouting.js`, which de-duplicates by notification id — the OS
returns the same cold-start response on every subsequent call, which would otherwise throw the
user back into the request every time they navigated home.

The route comes from the payload's own `screen` field
(`backend/src/services/pushMessages.js`), not from a mapping hard-coded here, so a deep link
can be fixed server-side without shipping an app update. An unrecognised payload opens
nothing rather than crashing on a route that does not exist.

### The request screen serves two people

The backend decides which, and sends `canRespond` / `canUpdateStatus` rather than leaving the
client to infer it from timestamps — a request that expired while the notification sat in the
tray must not still be answerable by a stale client.

- **A matched donor** gets two large buttons and, crucially, **not** the hospital's phone
  number. Contact details are unlocked by accepting, not handed to everyone who was pinged.
- **The requester** gets the list of donors being alerted, nearest first, each with a Call
  button — so they can start ringing immediately instead of waiting for anyone to answer a
  push — plus the way to close the request and stop further alerts.

The whole request is announced on arrival as one front-loaded sentence, in wording deliberately
close to the notification the donor just heard: *"Urgent. O negative blood needed. Apollo
Hospital, Bhubaneswar, about 3 kilometres away. 2 units needed. Closes in about 5 hours."*
Hearing one phrasing in the tray and a different one on screen makes a listener wonder whether
they opened the right thing. The same sentence is the card's accessible label, so it can be
heard again on demand rather than only once.

### Sign-out hands the push token back

`services/session.js` calls `DELETE /devices/:token` **before** clearing the tokens — the
delete needs a valid access token to prove the device is yours. On a shared phone, skipping
this means the next blood request arrives as a stranger's emergency on someone else's lock
screen.

This is deliberately not part of `api.signOut()`, which is also the *forced* sign-out path (a
donor marked unreachable in the CRM). There the token is already rejected and the call could
only fail. Those users keep their device row, which is harmless: a `DEAD` donor is excluded
from matching, so nothing is ever sent to it, and their next sign-in re-points the row at them.

### Two smaller ones

- **`tel:` failures are announced.** `Linking.openURL('tel:…')` rejects silently on a tablet,
  a locked-down work profile, or web. `utils/call.js` catches it and reads the number back
  digit by digit, so the user can at least dial it themselves. It deliberately does *not*
  check `canOpenURL` first — on Android that needs a `<queries>` manifest entry to answer
  truthfully and returns false on perfectly capable phones without one.
- **The search screen adds two filters the mockup does not have**: a radius (with a position,
  results are sorted nearest-first and carry a distance) and *Include compatible groups*.
  Someone who needs A positive can also receive from O positive, O negative and A negative;
  an exact-match filter shows them a quarter of the people who could help.

### Native modules

`expo-notifications` and `expo-device` were added this phase. The Android channel
(`blood-requests`) is created at startup and **must** match `PUSH_ANDROID_CHANNEL_ID` on the
backend — on Android it is the channel's importance, not anything in the payload, that decides
whether the phone makes a sound.

`EXPO_PUBLIC_PROJECT_ID` must be set to the EAS project id, or no push token can be minted.
Without it the app says so plainly instead of failing quietly.

---

## What Phase 11 built: the accessibility hardening pass

Full detail in **[docs/accessibility.md](docs/accessibility.md)**. The summary:

### Three things the audit found and fixed

1. **`AppSwitch` failed the target-size and focus-stop checks.** Only the ~50 × 30pt switch was
   tappable, and the row was four reader stops for one control. The row is now the control:
   one stop, `role="switch"`, 48dp across the full width, and tapping the label works.
2. **`AppDateInput` clipped at large text sizes.** Fixed-width Day/Month/Year boxes cut the last
   digit off a four-digit year at around 160% OS text. They now flex and wrap.
3. **Every announcement in the app was silent without a screen reader.**
   `announceForAccessibility` does nothing when no reader is running — so "3 donors found" and
   "That code was wrong" reached nobody who had not set TalkBack up.

That third one is fixed by routing `announce()` through the new voice guidance service, which
made all fourteen screens audible without any of them changing.

### Three preferences, remembered

On **Home → Accessibility settings**, persisted in `services/preferences.js`:

| | What it does |
| --- | --- |
| **Voice guidance** | The app reads each screen's purpose and every confirmation aloud with `expo-speech` — for users who have not set a screen reader up, which is most newly blind users and anyone on a shared family phone |
| **Big text** | Every font size and **line height** × 1.3, on top of the OS setting rather than replacing it |
| **High contrast** | Muted greys dropped (6.58:1 → 17.17:1), outlines near-black and 2px, primary fill darkened to AAA, buttons 48dp → 56dp |

**Voice guidance never double-speaks.** With a screen reader running it stays silent for screen
introductions and hands every message back to the reader, so a message is heard exactly once by
whichever channel is active. Reader state is tracked live, so turning VoiceOver on mid-session
cuts speech off and switches channels immediately.

The preference store is a module-level `useSyncExternalStore`, not a context — `AppText` needs
the text scale and `AppText` is everywhere, including inside modals rendered outside the screen
tree. There is no provider boundary to forget.

### Dictation, written and flagged off

`@react-native-voice/voice` is loaded through a **guarded optional `require`**. With the package
absent, the app bundles and runs exactly as now and simply does not offer dictation — no crash,
no broken import. Installing it, adding the config plugin and setting
`EXPO_PUBLIC_ENABLE_VOICE_INPUT=true` turns it on; nothing else changes. It needs an EAS dev
build, which is why it is not on by default. Steps are in
[docs/accessibility.md §5](docs/accessibility.md).

---

## Testing with a screen reader

**This is not optional, and it is not something a sighted-only pass can substitute for.** Turn
the reader on and drive the app without looking at it.

### Turning it on

| | |
| --- | --- |
| **Android — TalkBack** | Settings → Accessibility → TalkBack. Shortcut: hold both volume keys for 3 seconds (enable it first in the TalkBack settings). |
| **iOS — VoiceOver** | Settings → Accessibility → VoiceOver. Shortcut: Settings → Accessibility → Accessibility Shortcut → VoiceOver, then triple-click the side button. |

Set the shortcut up **before** you start. Turning a screen reader off again while it is on is
harder than it sounds, and it is the moment most people give up.

### Gestures

| Action | TalkBack | VoiceOver |
| --- | --- | --- |
| Next / previous element | Swipe right / left | Swipe right / left |
| Activate | Double-tap | Double-tap |
| Scroll | Two-finger swipe | Three-finger swipe |
| Jump by heading | Swipe up then right → Headings | Rotor (two-finger twist) → Headings |
| Read from top | Swipe up then right → "Read from next item" | Two-finger swipe down |

### The Phase 7 checklist

Open `/demo` (Home → "See the component kit") with the reader on:

1. **Focus lands on the heading.** On entering any screen the first thing spoken should be its
   title — "Component kit, heading" — not "back button" and not silence.
2. **Headings are navigable.** Switch to heading navigation and confirm you can jump between
   the card titles without swiping through every element.
3. **Buttons announce as buttons**, with their hint. The loading button should say *busy*; the
   disabled one *dimmed* or *disabled*. Press "Send one time password" and confirm the state
   change is spoken, not just spun.
4. **Inputs announce their label, and "required" where it applies** — "Full name, required,
   edit box". The label must still be spoken *after* you have typed into the field.
5. **Errors announce themselves.** Clear the name field, press "Check this form": you should
   hear the error, and focus should move to the offending field on its own. Then navigate back
   to that field and confirm the error is read again as part of its name.
6. **The dropdown reports its value.** "Blood group, required, combo box, No selection".
   Open it, confirm focus moves into the sheet, that options announce as radio buttons with a
   checked state and an "item 4 of 8" position, and that closing it returns focus to the
   trigger rather than to the top of the screen.
7. **Live messages speak.** Press Info / Success / Warning / Error and confirm each is spoken
   once — not twice (that would mean both announcement mechanisms fired) and not zero times.
8. **The grouped card is one stop.** The Ravi Kumar card should read as a single sentence, not
   as four separate fragments you have to reassemble.

### The Phase 8 checklist — the sign-in journey

Drive the whole flow with the reader on, from a cold start, **without looking at the screen.**

1. **Landing.** The first thing spoken is "Red Express, emergency blood helpline, heading" — the
   logo drawing itself stays silent. One swipe gives the tagline. Login and Register announce as
   buttons with their hints.
2. **Join Red Express.** Each card is a *single* stop that reads title and description as one
   phrase — "Become a donor. Register your blood group today and help save lives during
   emergencies, button" — not two fragments to reassemble.
3. **Mobile number.** Focus lands on the heading, *not* in the text field: you should hear where
   you are before the keyboard opens. The field announces "Mobile number, required, edit box" and
   still says its name after you have typed into it.
4. **Bad number.** Enter five digits and press Send. The error is spoken, and focus moves to the
   field on its own. Navigate back to it and confirm the error is read again as part of its name.
5. **Sending.** "Sending code" is spoken while the request is in flight, and the button reports
   *busy* — not silence and then, abruptly, a different screen.
6. **On success**, "One time password sent to 7 0 0 8 …" is read digit by digit, so you can check
   it against your phone.
7. **Verify screen.** The number is one stop: "Code sent to plus 9 1 …". The code field announces
   as **one** "Verification code" field — if you hear six edit boxes, something has regressed.
8. **Type three digits, then swipe back to the field.** It reads them back separated — "3, 4, 1" —
   not as a number. **Nothing submits**, because a reader is running. Find Submit and confirm it
   reports *dimmed* until all six digits are in.
9. **Wrong code.** Submit `000000`. The error is spoken, the boxes clear, and focus returns to the
   field — not to the button you just pressed.
10. **Resend.** Land on the button and confirm it says "Resend code, available in N seconds,
    dimmed". Then wait: "You can now request a new code" is announced **exactly once**, and the
    countdown never interrupts you while it ticks.
11. **Verify for real** (`devCode` from the console provider). "Verified" is announced before the
    screen changes, and you land on the donor form or home depending on whether the profile is
    finished.
12. **The dead-donor loop.** Mark the donor unreachable in the CRM (Phase 14), return to the app
    and do anything: you should *hear* why you were signed out, land on the number screen with
    that reason shown, and find that verifying an OTP puts you back — announced as "Verified.
    Welcome back, you are on the donor list again."

### The Phase 9 checklist — registration and profile

Continue from step 11 above, on a **real device** (the photo and GPS paths do not exist on web).

1. **Section headings.** Switch to heading navigation on the donor form and confirm you can
   jump Personal Information → Location Information → Security without swiping through thirty
   controls. This is the difference between a usable long form and an unusable one.
2. **The phone is not a disabled field.** It reads as one stop — "Mobile number, 70086 17451,
   verified, this cannot be changed here" — and never announces "dimmed".
3. **Blood group.** The combo box reports its value, and options read "A positive", not "A
   plus". Choosing one announces the selection, because the trigger changed while your
   attention was inside the sheet.
4. **Date of birth.** Three fields, each announcing "Date of birth, day" and so on. Type two
   digits into Day and confirm **focus does not jump**. Enter 31/2/1990 and confirm it is
   rejected as a real date, not accepted and reformatted.
5. **Photo.** Choose one and confirm "Photo selected" is announced with the file name and size.
   Cancel the picker and confirm "No photo chosen" is announced — not silence. Deny the
   permission and confirm you are told, and that you can still register.
6. **District → city.** Choose a district and confirm you hear "District set to X. Now choose
   your city or town." Choose **Other** and confirm the free-text field appears and is
   reachable.
7. **Location.** Read the rationale before the button — it should be one swipe above it. Press
   it and **deny** the OS prompt: you should hear that the typed address will be used instead,
   and registration must still work.
8. **The checkbox.** It announces "checkbox, not checked", the whole label row activates it,
   and it says "checked" when it changes.
9. **Submit with the form empty.** You should hear *"There are N problems. Full name. Enter
   your full name."* — a named field, not a count — and land on that field with its error read
   out on arrival. Fix it, submit again, and confirm the announcement now names the *next*
   field down the form.
10. **Submit for real.** "Account created" is announced along with what will happen to your
    location — exact position, address, or district only — before the screen changes.
11. **Profile, read mode.** Each fact is one stop: "Blood group, O positive". Nothing announces
    "dimmed". The phone number is read digit by digit.
12. **The availability switch.** It announces "Available to donate, switch, on", and the state
    is *also* written out as text you can read without focusing the control. Toggle it and
    confirm the server's own sentence is announced. Then turn airplane mode on and toggle it
    again: the switch must snap back and say why.
13. **Last donation.** Save a date and confirm the eligibility sentence updates and is spoken.
    Enter a future date and confirm it is refused with a spoken reason.

### The Phase 10 checklist — search, requests, and the alert loop

Steps 1–6 work in Expo Go. **Steps 7 onwards need a dev build on a real device** — Expo Go
cannot receive push notifications.

1. **Find donors, empty search.** Press Search with nothing chosen: you should hear *"There is
   a problem. Choose a blood group, a district, or share your location before searching."*
2. **A real search.** Choose a blood group and a district, press Search. *"Searching for
   donors"* is announced while it runs, then the count — *"3 donors found."* — and the reader
   lands on the results heading. If the list simply appears and nothing is said, that is the
   bug this whole screen is built around.
3. **A result card is two stops.** Swipe: one summary sentence, then "Call Ravi Kumar, 7 0 0 8
   …, button". If you hear the name, group, distance and availability as four separate
   fragments, the grouping has regressed.
4. **Call.** Activate the Call button and confirm the dialler opens with the number filled in.
   On a device that cannot call, confirm you *hear* why and hear the number read back.
5. **No results.** Search a district with no donors: the empty state must be spoken and must
   say what to try next, not just leave the list blank.
6. **Post a request.** Submit it empty and confirm the first problem is announced by name and
   focus moves there. Fill it in and post: *"Request posted. N nearby donors are being
   notified."* is announced **before** the screen changes, and the detail screen lists those
   donors nearest-first with a Call button each.
7. **Turn on alerts.** On home, find the alerts card. Read the rationale, press *Turn on
   alerts*, and confirm the OS prompt appears only after that press. Accept it: *"Alerts are
   on. You will be told when someone near you needs your blood group."* Deny it instead and
   confirm you are told what still works. The card must disappear once alerts are on.
8. **Receive one.** From a second account (or the CRM), post a request matching the donor's
   blood group near their location. The phone should buzz with *"Urgent: O negative blood
   needed nearby"* — check the words: no emoji, no ALL CAPS, group spelled out.
9. **Tap it, warm.** With the app open, tap the notification: it should open the request and
   announce the whole thing as one sentence.
10. **Tap it, cold.** Force-quit the app, send another request, and tap that notification. It
    must still land on the request — this is the path that silently breaks.
11. **Answer.** Confirm the hospital's number is **not** shown before you accept. Press *Yes, I
    can donate*: the confirmation is announced and the number appears. Confirm the requester's
    phone gets *"<name> can donate"*.
12. **The inbox.** Open *Your alerts*. Each row is one stop beginning with "Unread" where it
    applies. Open one, go back, and confirm it is no longer unread and the count on home has
    dropped.
13. **Sign out and back in.** Confirm alerts still arrive after signing in again — the token is
    unregistered on sign-out and must be registered again on the next launch.

### The Phase 11 checklist — preferences

Full steps in [docs/accessibility.md §6](docs/accessibility.md). The short version:

1. **Voice guidance, screen reader OFF.** Home → Accessibility settings → *Read screens aloud*.
   It should speak the moment you flip it — that is the confirmation. Navigate to Find donors
   and confirm the screen introduces itself; search and confirm the count is spoken.
2. **Turn the screen reader ON while voice guidance is still on.** Speech must cut off
   immediately, everything must come through the reader instead, and **nothing may be said
   twice**. The settings card should now explain that Red Express is staying quiet.
3. **Big text on top of maximum OS text size.** Walk the donor form and the request form. No
   text may be cut off. Watch the Day/Month/Year boxes and the six code boxes in particular.
4. **High contrast.** Every input and button should have a visible dark outline; captions should
   be the same black as body text; primary buttons visibly larger. Disabled controls should
   *still* look disabled — that distinction is deliberately preserved.
5. **`/demo`** carries live switches for all three, so their effect can be seen against every
   component at once.

### Also test without a screen reader

- **Font scaling.** Set the OS text size to its largest (Android: Settings → Display → Font
  size; iOS: Settings → Accessibility → Display & Text Size → Larger Text, with "Larger
  Accessibility Sizes" on). Nothing should clip or overlap; buttons should grow, and long
  labels should wrap to a second line. Then turn **Big text** on as well and repeat.
- **Colour.** Turn on a greyscale filter (Android: Developer options → Simulate colour space →
  Monochromacy; iOS: Accessibility → Display & Text Size → Colour Filters → Greyscale). Every
  state should still be distinguishable, because every one carries a word or an icon as well as
  a colour.

### What you cannot test in Expo Go or on web

- **Push notifications** need a real device and a **dev build** (`eas build --profile
  development`) plus `EXPO_PUBLIC_PROJECT_ID`. Expo Go dropped remote push in SDK 53, and a
  simulator has no push service to mint a token against. The app reports both as
  `status: 'unsupported'` with an explanation rather than a stack trace, and everything short
  of the wire — the inbox, read state, request detail, Accept and Decline — still works
  without it. Backend side: `PUSH_PROVIDER=console` prints instead of sending
  (`backend/docs/notifications.md`).
- **Native voice input** (`@react-native-voice/voice`) needs a dev build and a config plugin.
  Written and wired behind a feature flag; see [docs/accessibility.md §5](docs/accessibility.md)
  for how to turn it on.
- **Text-to-speech** (`expo-speech`, used by voice guidance) works in Expo Go on a device but
  needs a TTS engine installed. Most Android phones have one; a bare emulator image often does
  not, and `speak()` fails silently there by design rather than crashing a form.
- **Haptics** do nothing on web and on most emulators.
- **The photo picker and GPS** (`expo-image-picker`, `expo-location`) do not work on web. Both
  work in Expo Go on a device — no dev build needed — but the emulator's GPS returns whatever
  position you last set in its controls, so test location capture on real hardware.
- **The web build is a development convenience, not an accessibility test surface.**
  react-native-web maps some accessibility props differently from native — `accessibilityValue`
  is one — so a browser check will disagree with the device in both directions. Test on a phone.

---

## Monorepo note

Expo runs inside npm workspaces, but npm hoists dependencies to the repo root, so a default
Metro config cannot resolve them. [`metro.config.js`](metro.config.js) sets `watchFolders` to
the repo root, adds both `node_modules` directories to `nodeModulesPaths`, and disables
hierarchical lookup so a package cannot be loaded twice (two copies of React is the classic
symptom — "invalid hook call").

If Metro suddenly cannot find a module, check there first before reinstalling anything.
