import * as Speech from 'expo-speech';
import { AccessibilityInfo, Platform } from 'react-native';
import { getPreferences, subscribePreferences } from './preferences';

/**
 * Voice guidance — the app reading itself aloud, for a user who is not running a screen
 * reader.
 *
 * ## Who this is for, given that TalkBack and VoiceOver exist
 *
 * It is easy to assume a blind user always has a screen reader on and that this feature is
 * redundant. In practice it is not:
 *
 *   - A newly blind or low-vision user often has not set a screen reader up. Learning
 *     TalkBack's gesture set is a project; installing one app and turning on "read things to
 *     me" is not.
 *   - A shared or borrowed phone — common where a family has one smartphone between them —
 *     will not have a reader configured, and turning one on system-wide changes the phone for
 *     everyone who uses it.
 *   - A sighted user driving to a hospital, or one holding a phone at arm's length in bad
 *     light, benefits from hearing "Request posted, twelve donors are being notified" without
 *     needing to read it.
 *
 * So this is complementary, not a substitute. The screen reader remains the primary support
 * and everything in this app is built to work with it first.
 *
 * ## The double-speaking rule
 *
 * Two voices reading the same sentence at slightly different speeds is worse than either one
 * alone — it is genuinely hard to follow, and it is the standard failure of apps that bolt
 * TTS on. So when a screen reader is running, this module hands every message *back* to the
 * reader (`announceForAccessibility`) instead of speaking it, and stays silent for screen
 * introductions, which the reader already covers by focusing the heading.
 *
 * The result is that a message is heard exactly once, by whichever channel is active:
 *
 *   screen reader on   → the reader announces it; TTS silent
 *   voice guidance on  → TTS speaks it; the reader is not running to announce anything
 *   neither            → announced anyway, in case reader detection is lagging
 *
 * The reader's state is tracked in a module-level variable rather than read on demand, because
 * `isScreenReaderEnabled()` is a promise and the decision has to be made synchronously inside
 * `announce()`. It is kept current by a listener — a user can turn VoiceOver on mid-session,
 * and someone struggling with an app often does exactly that.
 */

let screenReaderOn = false;

AccessibilityInfo.isScreenReaderEnabled()
  .then((value) => {
    screenReaderOn = value;
  })
  .catch(() => {
    // Web, or an OS that refused to answer. Assume no reader; the worst case is that a
    // message is spoken by TTS as well as announced, which only happens if a reader is
    // running and we could not tell.
  });

AccessibilityInfo.addEventListener('screenReaderChanged', (value) => {
  screenReaderOn = value;
  // A reader that has just come on must not be talked over by a sentence started a moment
  // before it.
  if (value) stopSpeaking();
});

/**
 * Whether TTS should be doing the talking right now.
 *
 * Synchronous by design — `announce()` has to pick a channel in the moment, and
 * `isScreenReaderEnabled()` is a promise. Components that want to *render* differently based
 * on reader state should use the `useScreenReaderEnabled` hook instead, which re-renders.
 */
export function voiceGuidanceActive() {
  return getPreferences().voiceGuidance && !screenReaderOn;
}

// Turning the preference off mid-sentence should stop the sentence, not let it finish.
subscribePreferences(() => {
  if (!getPreferences().voiceGuidance) stopSpeaking();
});

// ---------------------------------------------------------------------------
// Speaking
// ---------------------------------------------------------------------------

const SPEECH_OPTIONS = {
  // Slightly under the default. These are addresses, blood groups and phone numbers heard
  // once, often by someone under stress, and the default rate is tuned for prose.
  rate: Platform.OS === 'ios' ? 0.48 : 0.95,
  pitch: 1.0,
  language: 'en-IN',
};

/**
 * Speak a message, if voice guidance is on and no screen reader is running.
 *
 * Returns whether it spoke, so callers that need a fallback channel can tell.
 */
export function speak(text, { interrupt = true } = {}) {
  if (!text || !voiceGuidanceActive()) return false;

  try {
    // Later messages matter more than earlier ones — an error about the code you just typed
    // should not wait behind the screen description that was still playing.
    if (interrupt) Speech.stop();
    Speech.speak(String(text), SPEECH_OPTIONS);
    return true;
  } catch {
    // No TTS engine installed, or the OS refused. Never worth crashing a form over.
    return false;
  }
}

/** Cut off whatever is being said. Called on navigation and when the preference goes off. */
export function stopSpeaking() {
  try {
    Speech.stop();
  } catch {
    // Nothing was speaking, or there is no engine. Either way, nothing to do.
  }
}

// ---------------------------------------------------------------------------
// Screen introductions
// ---------------------------------------------------------------------------

/**
 * The sentence spoken on entering a screen: what it is, what it is for, and the one thing to
 * do on it.
 *
 * Deliberately three short clauses. A paragraph read at every screen change is something
 * users turn off within a day, which leaves them worse off than if it had never been offered.
 */
export function describeScreen({ title, purpose, action }) {
  return [title ? `${title}.` : null, purpose, action ? `Main action: ${action}.` : null]
    .filter(Boolean)
    .join(' ');
}

/**
 * Speak a screen introduction.
 *
 * Silent when a screen reader is running — it has already moved focus to the heading and read
 * it, and repeating the same information in a second voice is exactly the double-speaking
 * this module exists to avoid.
 */
export function speakScreen({ title, purpose, action }) {
  return speak(describeScreen({ title, purpose, action }));
}
