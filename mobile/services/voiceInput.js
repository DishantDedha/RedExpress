import { Platform } from 'react-native';
import { config } from './config';

/**
 * Dictation for form fields — speaking an address instead of typing it.
 *
 * ## Why this is behind a flag and not simply built
 *
 * The donor form (Phase 9) asks for a name, a street address and a city. Typing a long
 * address on a phone keyboard with a screen reader running is genuinely slow: every character
 * is announced, the keyboard occupies most of the screen, and a typo is only discoverable by
 * re-reading the whole field. Dictation is the single largest usability win available on that
 * form.
 *
 * The cost is that it cannot be done in Expo Go. `@react-native-voice/voice` is a native
 * module: it needs a config plugin, `NSSpeechRecognitionUsageDescription` and
 * `NSMicrophoneUsageDescription` on iOS, `RECORD_AUDIO` on Android, and therefore an EAS
 * development build. Adding it unconditionally means `npm start` no longer opens the app on a
 * teammate's phone, which is a real cost paid by everyone for a feature not everyone can run.
 *
 * So the module is loaded *optionally*. If the package is not installed, `available()` returns
 * false and the UI simply does not offer dictation — no crash, no red screen, no broken
 * import at bundle time. Installing it and rebuilding turns the feature on; nothing else has
 * to change.
 *
 * ## Turning it on
 *
 *   1. `npx expo install @react-native-voice/voice`
 *   2. Add the plugin to `app.json`:
 *
 *        ["@react-native-voice/voice", {
 *          "speechRecognitionPermission": "Red Express uses speech recognition so you can speak your address instead of typing it.",
 *          "microphonePermission": "Red Express needs your microphone so you can speak your address instead of typing it."
 *        }]
 *
 *   3. `EXPO_PUBLIC_ENABLE_VOICE_INPUT=true` in `mobile/.env`
 *   4. `eas build --profile development` — Expo Go will not do.
 *
 * The user-facing toggle is on the accessibility settings screen and is hidden entirely when
 * the module is missing, so nobody is offered a switch that does nothing.
 *
 * ## Dictation is never the only way in
 *
 * Every field that offers it keeps its keyboard. Speech recognition fails on Indian English
 * place names often enough that a dictation-only field would be a trap, and a user in a noisy
 * hospital corridor cannot use it at all.
 */

/**
 * The native module, or null.
 *
 * A guarded `require`, not an `import`: a static import of a package that is not installed is
 * a bundler error at build time, which is precisely the outcome the optional dependency is
 * meant to avoid.
 */
let Voice = null;
let loadError = null;

try {
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  const mod = require('@react-native-voice/voice');
  Voice = mod?.default ?? mod ?? null;
} catch (error) {
  loadError = error;
}

/**
 * Whether dictation can actually run here: package present, flag on, native platform.
 *
 * This is only half the test. The user's `voiceInput` preference is the other half, and it is
 * read reactively by `DictationButton` so that switching it on in settings makes the button
 * appear on a form that is already open.
 */
export function voiceInputAvailable() {
  return Boolean(Voice) && config.enableVoiceInput && Platform.OS !== 'web';
}

/** Why it is unavailable, for the settings screen to explain rather than silently omit. */
export function voiceInputStatus() {
  if (Platform.OS === 'web') {
    return { available: false, reason: 'Dictation is not available in the web preview.' };
  }
  if (!Voice) {
    return {
      available: false,
      reason:
        'Dictation needs a development build of the app. See mobile/docs/accessibility.md for how to add it.',
      detail: loadError?.message ?? null,
    };
  }
  if (!config.enableVoiceInput) {
    return {
      available: false,
      reason: 'Dictation is switched off in this build.',
    };
  }
  return { available: true, reason: null };
}

// ---------------------------------------------------------------------------
// Recognition
// ---------------------------------------------------------------------------

/**
 * Listen once and hand back what was said.
 *
 * Wrapped in a promise rather than exposing the module's event emitter, because every caller
 * wants the same thing: start, get a string, stop. `onPartial` is offered for the one thing a
 * raw event stream is genuinely better at — showing words as they are recognised, so a
 * sighted user can see it is working and a screen-reader user can be told.
 *
 * Errors resolve rather than reject, with a message written for a person: a failed dictation
 * is an ordinary outcome, not an exception, and the field it belongs to still works.
 */
export function listenOnce({ locale = 'en-IN', onPartial } = {}) {
  if (!voiceInputAvailable()) {
    return Promise.resolve({ ok: false, message: voiceInputStatus().reason });
  }

  return new Promise((resolve) => {
    let settled = false;

    function finish(result) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    }

    function cleanup() {
      try {
        Voice.removeAllListeners?.();
        Voice.stop?.();
      } catch {
        // Already stopped, or the module is in a state it cannot be asked about. Nothing
        // useful to do, and nothing worth surfacing to a user mid-form.
      }
    }

    Voice.onSpeechPartialResults = (event) => {
      const text = event?.value?.[0];
      if (text) onPartial?.(text);
    };

    Voice.onSpeechResults = (event) => {
      const text = event?.value?.[0];
      finish(
        text
          ? { ok: true, text }
          : { ok: false, message: 'Nothing was recognised. Try again, or type it instead.' },
      );
    };

    Voice.onSpeechError = (event) => {
      // The platform codes are not fit to show anyone ("7/No match"). The common causes get a
      // sentence that says what to do about them.
      const code = String(event?.error?.code ?? '');
      const message = code.includes('permission')
        ? 'Red Express does not have permission to use the microphone. You can allow it in your phone settings.'
        : 'Nothing was recognised. Try again, or type it instead.';
      finish({ ok: false, message });
    };

    try {
      Voice.start(locale);
    } catch {
      finish({ ok: false, message: 'Dictation could not start. Type it instead.' });
    }
  });
}

/** Stop listening early — the user pressed the button a second time. */
export async function stopListening() {
  if (!Voice) return;
  try {
    await Voice.stop();
  } catch {
    // Nothing was listening.
  }
}
