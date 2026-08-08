'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Toasts — the app's single channel for "that worked" / "that didn't".
 *
 * Accessibility is the whole design here, because a toast is the classic control that a
 * sighted user notices and a screen-reader user never hears:
 *
 *   - Two live regions, not one. Success and info are `polite` (they wait for a gap in
 *     speech); errors are `assertive` (they interrupt). A failed "mark as dead" must not sit
 *     silently in a queue behind other output.
 *   - The regions are in the DOM from first render. A live region added to the page at the
 *     same moment as its content is frequently not announced at all — the message has to
 *     arrive into a region the screen reader is already watching.
 *   - Every toast carries its status as a word ("Done", "Problem"), not only a colour, so it
 *     survives both greyscale and speech.
 *   - Errors do not auto-dismiss. A message that disappears after four seconds is a message a
 *     staff member reading slowly, or tabbing back from a phone call, never got.
 */

const ToastContext = createContext(null);

const TONE = {
  success: {
    word: 'Done',
    className: 'border-success bg-success-tint text-ink',
    iconClass: 'text-success',
    icon: '✓', // check mark
  },
  error: {
    word: 'Problem',
    className: 'border-danger bg-danger-tint text-ink',
    iconClass: 'text-danger',
    icon: '⚠', // warning sign
  },
  info: {
    word: 'Note',
    className: 'border-info bg-info-tint text-ink',
    iconClass: 'text-info',
    icon: 'ℹ', // information
  },
};

const DEFAULT_DURATION = 6000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (input) => {
      const toast = {
        id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        tone: 'info',
        ...(typeof input === 'string' ? { message: input } : input),
      };

      setToasts((current) => [...current, toast]);

      // Errors stay until dismissed; see the note above.
      const duration = toast.duration ?? (toast.tone === 'error' ? null : DEFAULT_DURATION);
      if (duration) {
        timers.current.set(
          toast.id,
          setTimeout(() => dismiss(toast.id), duration),
        );
      }

      return toast.id;
    },
    [dismiss],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup only, runs on unmount.
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const api = useMemo(
    () => ({
      show,
      dismiss,
      success: (message, options) => show({ ...options, message, tone: 'success' }),
      error: (message, options) => show({ ...options, message, tone: 'error' }),
      info: (message, options) => show({ ...options, message, tone: 'info' }),
    }),
    [show, dismiss],
  );

  const polite = toasts.filter((toast) => toast.tone !== 'error');
  const assertive = toasts.filter((toast) => toast.tone === 'error');

  return (
    <ToastContext.Provider value={api}>
      {children}

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end">
        <ToastRegion toasts={polite} politeness="polite" onDismiss={dismiss} />
        <ToastRegion toasts={assertive} politeness="assertive" onDismiss={dismiss} />
      </div>
    </ToastContext.Provider>
  );
}

function ToastRegion({ toasts, politeness, onDismiss }) {
  return (
    <div
      // role="status"/"alert" pairs with aria-live so the region is recognised by older
      // screen readers that only honour one of the two.
      role={politeness === 'assertive' ? 'alert' : 'status'}
      aria-live={politeness}
      aria-atomic="false"
      className="flex w-full max-w-md flex-col gap-2"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function Toast({ toast, onDismiss }) {
  const tone = TONE[toast.tone] ?? TONE.info;

  return (
    <div className={`pointer-events-auto flex items-start gap-3 rounded-lg border-l-4 p-3 shadow-lg ${tone.className}`}>
      <span aria-hidden="true" className={`text-lg leading-6 ${tone.iconClass}`}>
        {tone.icon}
      </span>

      <div className="min-w-0 flex-1 text-sm">
        {/* The status word is read aloud and shown, so the meaning never depends on the colour
            of the border or the shape of the icon. */}
        <p className="font-semibold">
          {tone.word}
          {toast.title ? `: ${toast.title}` : ''}
        </p>
        <p className="mt-0.5 break-words text-ink">{toast.message}</p>
      </div>

      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label={`Dismiss notification: ${toast.message}`}
        // 44px hit area, the same touch-target floor the mobile app holds itself to.
        className="-m-1 flex h-11 w-11 shrink-0 items-center justify-center rounded text-ink-muted hover:text-ink"
      >
        <span aria-hidden="true" className="text-xl leading-none">
          &times;
        </span>
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast() was called outside ToastProvider.');
  return context;
}
