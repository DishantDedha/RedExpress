# Accessibility

Red Express is used by people who cannot see their phone, at a moment when getting it wrong
means someone does not get blood. The primary user of this app is a blind donor with a screen
reader running; everything below is written from that premise rather than as a compliance
exercise.

This document is the Phase 11 record: what was built, what was fixed in the audit, how to test
it by hand, and what is still missing.

---

## 1. How accessibility is enforced, not just intended

Almost none of this lives in the screens. It lives in the component kit, which is the only
reason it holds across fourteen screens written over eleven phases.

| Where | What it guarantees |
| --- | --- |
| [`components/AppText.js`](../components/AppText.js) | Font scaling is never disabled. Headings get `accessibilityRole="header"`. Big text and high contrast are applied here, once, for every piece of text in the app. |
| [`components/AppButton.js`](../components/AppButton.js) | Role, label, `disabled`/`busy` state, 48dp minimum, hit slop, label that wraps instead of clipping. |
| [`components/AppTextInput.js`](../components/AppTextInput.js) | A **visible** label, never a placeholder. Errors folded into the accessible name and announced when they appear. |
| [`components/AppSelect.js`](../components/AppSelect.js) | `combobox` with its value; options are `radio` with `checked` and an "item 4 of 8" position. Focus enters the sheet and returns to the trigger. |
| [`components/AppSwitch.js`](../components/AppSwitch.js) | The whole row is the control: one focus stop, `role="switch"`, state in words as well as position. |
| [`components/AppCheckbox.js`](../components/AppCheckbox.js) | A real `checkbox` role with `checked` state; label is part of the target. |
| [`components/OtpInput.js`](../components/OtpInput.js) | Six boxes drawn, **one** text field underneath — SMS autofill works and the reader announces one coherent field. |
| [`components/AppDateInput.js`](../components/AppDateInput.js) | Three labelled fields, no auto-advance, four-digit year. Not a picker wheel. |
| [`components/LiveMessage.js`](../components/LiveMessage.js) | Every async state change is announced, on the correct platform mechanism, and rendered visibly as well. |
| [`components/ScreenHeader.js`](../components/ScreenHeader.js) | Moves screen-reader focus to the heading on every screen entry, and carries the voice-guidance copy. |
| [`hooks/useAccessibilityFocus.js`](../hooks/useAccessibilityFocus.js) | Focus-on-mount, focus-to-first-error, and live screen-reader detection. |
| [`scripts/check-contrast.mjs`](../scripts/check-contrast.mjs) | `npm run verify:contrast` fails the build if any rendered colour pair drops below its WCAG minimum. 48 pairs, including high-contrast mode at AAA. |

If a screen needs a bare `Pressable`, `Text` or `TextInput`, that is a signal the kit is missing
something. Add it to the kit; do not work around it, or the guarantees stop being guarantees.

---

## 2. The audit

Every screen was walked against the Phase 11 checklist. Most items already passed — they were
built into the kit in Phase 7 rather than retrofitted. These are the items that **failed** and
what was done about them.

### 2.1 `AppSwitch` — target size and focus stops (fixed)

**Failure.** The row was a label beside a platform `Switch`. Two problems:

- Only the switch itself was tappable — roughly 50 × 30 points, well under the 48dp minimum
  (WCAG 2.5.5), and tapping the words did nothing. This is the hardest control in the app to
  hit with a tremor, and tapping a control's label is a universal expectation.
- The label, the state sentence and the helper text were three separate reader stops, followed
  by a fourth stop (the switch) that repeated the label and the state. Four stops for one
  control, and the first three of them not actionable.

**Fix.** The row itself is now the accessible element: `accessibilityRole="switch"`,
`accessibilityState.checked`, `accessibilityValue.text` carrying the meaning. One stop, one
sentence, 48dp across the full width, activated by double-tap from either reader. The platform
`Switch` inside is wrapped in a `pointerEvents="none"` view and hidden from the tree — it is
now purely a picture of the state.

**Why a sighted-only test would have missed it.** With a mouse or a precise finger tap the
original worked fine, and the extra reader stops are invisible unless you are swiping through
them.

### 2.2 `AppDateInput` — clipping at large text sizes (fixed)

**Failure.** The Day, Month and Year boxes had fixed widths (72 / 82 / 104pt). At around 160%
OS text size a four-digit year no longer fits in 104pt and the last digit is cut off. The user
sees `202` where they typed `2024`, and the validation error that follows makes no sense.

**Fix.** `flexBasis` + `flexGrow` instead of `width`. The boxes keep their relative proportions
at default size, grow with the text, and the row wraps to a second line before anything clips.

**Why a sighted-only test would have missed it.** Nobody testing at default text size will ever
see it. This is the single most common React Native accessibility bug and it is silent.

### 2.3 Announcements were inaudible without a screen reader (fixed)

**Failure.** `AccessibilityInfo.announceForAccessibility` does nothing at all when no screen
reader is running. Every "3 donors found", "One time password sent", and "That code was wrong"
in the app was silent for a low-vision user who has not set TalkBack up — which is a large
share of the people this app is for.

**Fix.** `announce()` in `LiveMessage.js` now picks a channel per message: the screen reader if
one is running, otherwise text-to-speech if voice guidance is on. Every existing `say(...)` call
across all fourteen screens became audible without any screen changing.

### 2.4 Everything else on the checklist

| Check | Result |
| --- | --- |
| Every actionable element has role + label + hint | Pass. Enforced by the kit; no bare `Pressable` exists outside `components/`. |
| Logical focus order; heading focus on mount | Pass. `ScreenHeader` does it for every screen; `app/index.js` is the one hand-wired exception and is documented in the file. |
| Focus moves to errors and results | Pass. `utils/form.js` announces the first error by name and moves the cursor to that field; `find-donors` moves the cursor to the results heading. |
| No information by colour or position alone | Pass. Availability, unread state, request status, switch state, validation state and severity all carry a word. `LiveMessage` prefixes "Error." / "Success." |
| Touch targets ≥ 48dp | Pass after §2.1. `a11y.minTouchTarget` is the floor on every interactive component; small buttons make it up with `hitSlop`. |
| OS font scaling without clipping | Pass after §2.2. `allowFontScaling` is never disabled anywhere; every screen scrolls; layouts use `minHeight`, wrapping and `flexShrink`. |
| Async state changes announced | Pass, and now audible without a reader (§2.3). |
| Decorative images hidden | Pass. The logo drop, the dropdown chevron, the checkbox tick, the code boxes, the photo preview and button spinners all set both `accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"` — each platform reads only one of the two. |
| OTP, dropdowns, checkboxes and switches announce state | Pass. Verified control by control on the demo screen. |

---

## 3. Voice guidance

**Where:** [`services/voiceGuidance.js`](../services/voiceGuidance.js),
[`hooks/useVoiceGuidance.js`](../hooks/useVoiceGuidance.js), toggled on
[`app/(app)/settings.js`](../app/(app)/settings.js), remembered in
[`services/preferences.js`](../services/preferences.js).

When it is on and **no screen reader is running**, the app speaks for itself with
`expo-speech`:

- **On entering a screen**, one short sentence: what the screen is, what it is for, and the
  primary action. "Find blood donors. Choose a blood group and an area, then search. Results
  are nearest first, each with a call button. Main action: Search."
- **Every confirmation, error and progress message**, because `announce()` routes through it.

### Why it exists when screen readers do

It is complementary, not a replacement — the screen reader remains the primary support and
everything in this app is built to work with it first. Voice guidance covers the cases a screen
reader does not reach:

- A newly blind or low-vision user often has not set a screen reader up. Learning TalkBack's
  gesture set is a project; turning on one switch in one app is not.
- A shared family phone — one smartphone between several people — cannot have a system-wide
  screen reader turned on without changing the phone for everyone.
- A sighted user driving to a hospital, or holding a phone at arm's length in bad light.

### The double-speaking rule

Two voices reading the same sentence at slightly different speeds is worse than either alone,
and it is the standard failure of apps that bolt TTS on. So a message is heard **exactly once**,
by whichever channel is active:

| Situation | Screen introductions | Confirmations and errors |
| --- | --- | --- |
| Screen reader running | Silent — the reader already focuses and reads the heading | Announced through the reader |
| Voice guidance on, no reader | Spoken by TTS | Spoken by TTS |
| Neither | Silent | `announceForAccessibility` anyway, in case reader detection is lagging |

Reader state is tracked in a module-level variable kept current by an
`AccessibilityInfo.addEventListener('screenReaderChanged')` subscription, because the decision
has to be made synchronously inside `announce()` and `isScreenReaderEnabled()` is a promise. A
user turning VoiceOver on mid-session — which is exactly what someone struggling with an app
does — is handled: speech is cut off immediately and the channel switches.

Turning the switch on **demonstrates itself** by speaking. If a screen reader is running it says
so plainly instead, rather than appearing to do nothing.

---

## 4. Big text and high contrast

Both are on the accessibility settings screen, both are remembered across restarts, and both
are applied centrally rather than screen by screen.

### Big text

Multiplies every font size and line height by `a11y.bigTextScale` (1.3), **on top of** the OS
text-size setting rather than replacing it. Scaling the size without the line height is the
classic mistake — the glyphs grow, the leading does not, and descenders collide with the line
below.

A user already at 200% who turns this on is asking for 260%, and gets it. Every screen scrolls
and every layout wraps, so text grows rather than clipping.

### High contrast

A set of substitutions on top of the one palette, not a second theme — so there is still one
set of colours to check and no chance of the two drifting apart.

| | Default | High contrast |
| --- | --- | --- |
| Helper text and captions | `#5A5D66`, 6.58:1 | `#1B1B1F`, **17.17:1** |
| Muted copy on the red surfaces | `#FFE9EC`, 6.32:1 | `#FFFFFF`, **7.33:1** |
| Input and button outlines | `#878A93`, 3.45:1, 1px | `#1B1B1F`, **17.17:1**, 2px |
| Card edges and list dividers | `#C4C7CF`, 1.69:1 | `#878A93`, 3.45:1, 2px |
| Primary button fill | `#B00020`, 7.33:1 | `#8C0019`, **9.86:1** (AAA) |
| Primary button outline | none | near-black, 2px |
| Default button height | 48dp | 56dp |

Two decisions worth stating:

- **Filled buttons gain an outline.** A filled button with no border relies on the fill being
  distinguishable from the page, which is exactly the perception reduced contrast sensitivity
  takes away. The outline gives every control a hard edge regardless of what is inside it.
- **Disabled text is deliberately *not* boosted.** Raising it to full contrast would erase the
  only visual difference between a control that can be used and one that cannot. High contrast
  should not cost a sighted user a state signal.

The brand-red screens are excluded from the border substitutions: on deep red, white is already
the highest-contrast edge available and near-black would be a step backwards.

All eleven high-contrast pairs are checked at **AAA (7:1)** by `npm run verify:contrast`. A mode
someone switches on to make things readable has to be measurably better than the default, not
merely different.

---

## 5. Voice input (dictation) — behind a feature flag

**Where:** [`services/voiceInput.js`](../services/voiceInput.js),
[`components/DictationButton.js`](../components/DictationButton.js).

Typing a full street address on a phone keyboard with a screen reader running is the slowest
thing in this app: every character is announced, the keyboard covers most of the screen, and a
typo is only discoverable by re-reading the whole field. Dictation is the largest single
usability win available on the donor form.

**Effort and why it is flagged off.** `@react-native-voice/voice` is a native module. It needs
a config plugin, `NSSpeechRecognitionUsageDescription` and `NSMicrophoneUsageDescription` on
iOS, `RECORD_AUDIO` on Android, and therefore an EAS **development build** — it does not run in
Expo Go. Adding it unconditionally means `npm start` stops opening the app on a teammate's
phone: a real cost paid by everyone for a feature not everyone can run.

So the integration is written and tested against a guarded optional `require`. With the package
absent it compiles, bundles and runs exactly as now, and the UI simply does not offer dictation
— no crash, no red screen, no broken import.

### Turning it on (about 30 minutes, plus a build)

```bash
npx expo install @react-native-voice/voice
```

Add the plugin to `app.json`:

```json
["@react-native-voice/voice", {
  "speechRecognitionPermission": "Red Express uses speech recognition so you can speak your address instead of typing it.",
  "microphonePermission": "Red Express needs your microphone so you can speak your address instead of typing it."
}]
```

Then:

```bash
echo "EXPO_PUBLIC_ENABLE_VOICE_INPUT=true" >> mobile/.env
eas build --profile development --platform android   # Expo Go will not do
```

The switch appears on the accessibility settings screen; until then that card explains why it
is unavailable rather than silently omitting it.

**Accessibility notes on the implementation itself.** Recognised text is *read back* rather than
silently dropped into the field — speech recognition mishears Indian place names often enough
that a user told nothing would submit a wrong address without knowing. The button is a toggle,
not press-and-hold: hold-to-talk requires knowing exactly where the button is and keeping a
finger on it, a gesture that does not survive being unable to see the screen. And every field
that offers dictation keeps its keyboard — it is never the only way in.

---

## 6. Manual test steps

Automated checks cannot find any of this. The contrast script (`npm run verify:contrast`) is the
only part that runs itself.

### 6.1 TalkBack (Android)

Turn it on: **Settings → Accessibility → TalkBack**, or hold both volume keys for three seconds
if that shortcut is enabled.

Gestures you need: swipe right/left to move between elements, double-tap to activate,
swipe up-then-right for the reading-controls menu, two-finger swipe to scroll.

### 6.2 VoiceOver (iOS)

Turn it on: **Settings → Accessibility → VoiceOver**, or triple-click the side button if that
shortcut is set. Use the rotor (two-finger rotate) to switch to **Headings** and swipe down to
jump heading to heading.

### 6.3 The donor journey, with the screen reader on

This is the smoke test. Do the whole thing without looking at the screen.

1. **Landing.** The app should open by saying "Red Express, emergency blood helpline, heading".
   Not "button", and not silence. Swipe on for the tagline, then Login and Register.
2. **Register → Become a Donor.** Each choice should read as one sentence — title and
   description together — not as two unrelated fragments.
3. **Mobile number.** Focus lands on the heading, *not* the field (auto-focus is deliberately
   off; it fights the heading focus). The field announces "Mobile number, required, edit box".
   Enter a bad number and press Send: the error is spoken and the cursor moves to the field.
4. **Send OTP.** "Sending code" is spoken while it is in flight, then "One time password sent to
   9 8 7 6 5 4 3 2 1 0" — **digit by digit**, not as one enormous number.
5. **Verification code.** Swipe to the field. It must announce **one** "Verification code" field,
   not six anonymous edit boxes. Type four digits, then swipe away and back: it should read back
   "4 0 7 1", spaced. Let the SMS arrive and confirm autofill fills all six at once.
6. **Donor form.** Work down it. Every field has a spoken label. The blood-group dropdown
   announces "combo box" and its current value; inside, each option says "radio button",
   "checked" where it applies, and "item 4 of 8". The terms control says "checkbox, not checked"
   and reports the change when you double-tap it.
7. **Submit with the form incomplete.** The first error must be *announced by field name* and
   the cursor must move to that field. "3 errors" with no navigation is the failure this
   mechanism exists to prevent.
8. **Home.** "Hello, <name>, heading". The donor record card is one stop reading as a sentence:
   blood group, availability, where you are registered.
9. **Find donors.** Search. The count is announced as a sentence ("3 donors found") *and* the
   cursor moves to the results heading. Each donor is two swipes: a summary sentence, then the
   Call button — which reads the number digit by digit before you dial it.
10. **Post a request** from a second account, then **tap the push notification** on the donor's
    phone. The request detail should announce the whole request as one paragraph on arrival and
    put the cursor on the Yes / No buttons, because answering is what the screen is for.
11. **Availability switch** on the profile. One stop. Tapping the *label* must toggle it. It
    announces the consequence — "you will not appear in searches" — not just "off".

### 6.4 Voice guidance, with the screen reader OFF

1. Turn TalkBack/VoiceOver **off**. Home → **Accessibility settings** → **Read screens aloud**.
2. It should speak the moment you flip it — that is the confirmation.
3. Navigate to Find donors. It should say what the screen is for and name the Search button.
4. Search. The result count should be spoken.
5. Now turn the screen reader **on** while voice guidance is still on. Speech should cut off
   immediately and everything should come through the screen reader instead. Nothing should be
   said twice. Go back to settings — the card should now explain that Red Express is staying
   quiet.

### 6.5 Font scaling and contrast

1. Set the OS text size to its **maximum** (Android: Settings → Display → Font size; iOS:
   Settings → Accessibility → Display & Text Size → Larger Text, with Larger Accessibility Sizes
   on).
2. Then turn **Big text** on in the app as well. Walk the donor form and the request form. No
   text may be cut off; every field, label and button must still be reachable by scrolling.
   Watch the Day/Month/Year boxes and the six code boxes in particular.
3. Turn **High contrast** on. Every input and button should have a visible dark outline; captions
   should be the same weight of black as body text; primary buttons should be visibly larger.
4. Take a screenshot and view it in greyscale. Nothing that matters may be indistinguishable —
   availability, unread state, request status and validation state should all still read as
   words.

### 6.6 The component kit as a test rig

[`app/demo.js`](../app/demo.js) has every component on one screen, plus live switches for the
three preferences, so their effect can be seen against everything at once. Turn a screen reader
on and work down that screen: it exercises errors that announce themselves, a combobox that
reports its value, a busy button, and live messages in every tone.

---

## 7. Known gaps

Stated plainly rather than left to be discovered.

1. **Dictation is not shipped.** Written, wired and flagged off; needs a dev build (§5).
2. **No braille display testing.** Everything is exposed through the standard accessibility
   APIs, so a braille display should work, but it has not been tried on hardware.
3. **English only.** All labels, announcements and voice copy are English, and the TTS locale is
   hard-coded to `en-IN`. For a service operating in Odisha, Odia and Hindi are a real gap — a
   donor who cannot read English gets nothing from any of this. Localisation was not in scope
   for any phase and is the single largest remaining accessibility issue in the product.
4. **`maxFontSizeMultiplier` is capped at 2.** The OS component of scaling stops there. The
   in-app big-text preference is applied on top and is *not* capped, so the real ceiling is
   2.6× — but a user who has pushed the OS past 200% will not see the difference beyond the cap
   unless they also turn big text on.
5. **No reduced-motion handling.** The app has almost no animation — the only ones are React
   Navigation's screen transitions and the dropdown sheet's slide — so this has not been wired
   to `AccessibilityInfo.isReduceMotionEnabled()`. Worth doing if animation is ever added.
6. **Voice guidance does not read list contents.** It speaks screen purposes and status
   messages, not the twenty donors in a result list. Reading a whole list aloud with no way to
   navigate within it would be worse than useless; doing it properly needs a
   next-item / previous-item control, which is a feature in its own right.
7. **The CRM (Phase 12–14) has had no equivalent audit.** It is keyboard-navigable by
   construction, but staff who rely on assistive technology have not been designed for to the
   same standard. That belongs in the CRM phases.
8. **Screen-reader testing has been done on emulators and one physical Android device.** Nothing
   here has been tested with a person who is actually blind. That is the test that matters most
   and it has not happened.

---

## 8. What a sighted-only test would have missed

Collected in one place, because it is the argument for testing with the screen reader on rather
than reasoning about it.

- **The six-box OTP field.** It looks correct and is close to unusable: six anonymous edit
  boxes, focus jumping mid-word on every keystroke, and SMS autofill handing all six digits to
  the first box, which keeps one and discards the rest. Fixed in Phase 8 by construction
  (`OtpInput.js`), before it could be written the obvious way.
- **Placeholder-as-label.** The mockups do it and it looks clean. The field loses its name the
  moment you type, exactly when you are checking what you typed.
- **A results list appearing below a button.** Completely silent to a screen reader: nothing the
  user is focused on changed. Fixed with an announced count and a focus move.
- **The date-of-birth field clipping at large text sizes** (§2.2) — invisible at default size.
- **Switch rows being four focus stops and a 30-point target** (§2.1) — invisible with a
  precise tap.
- **Every announcement in the app being silent without a screen reader** (§2.3).
- **`ALL CAPS` strings.** "EMERGENCY BLOOD HELPLINE" and "WE4YOU" are read letter by letter by
  both readers. The visible text keeps its capitals; the spoken label is sentence case.
- **Phone numbers.** Handed a bare number, a reader says "seven billion, eight million…", which
  cannot be checked against the phone in your hand. Every number in the app is spoken digit by
  digit (`utils/phone.js`).
- **`O+` versus `O-`.** Read aloud, "plus" and "minus" are a one-syllable difference on a field
  where being wrong is a medical error. Blood groups are always spoken as "O positive".
- **A green dot for availability, a blue dot for unread.** Both reach nobody who cannot see
  them, and both fail WCAG 1.4.1 for everyone else. Both carry a word.
- **Being signed out with no explanation.** A donor marked unreachable in the CRM is dumped at a
  login screen mid-task. A sighted user at least sees the screen change. The reason is now
  spoken immediately and shown on the sign-in screen (`app/_layout.js`).

---

## 9. References

- [WCAG 2.1](https://www.w3.org/TR/WCAG21/) — 1.4.1 (use of colour), 1.4.3 (contrast), 1.4.11
  (non-text contrast), 2.5.5 (target size), 4.1.2 (name, role, value).
- [React Native accessibility](https://reactnative.dev/docs/accessibility)
- [Android accessibility testing](https://developer.android.com/guide/topics/ui/accessibility/testing)
- [iOS VoiceOver testing](https://developer.apple.com/documentation/accessibility)
- [GOV.UK date input research](https://design-system.service.gov.uk/components/date-input/) —
  why `AppDateInput` is three fields rather than a picker.
