"use client";

/**
 * A success message that shows itself and then goes away on its own.
 *
 * Every "Saved." confirmation in the app used to be a plain piece of state that stayed on
 * screen until some unrelated action happened to clear it — so a page could sit there
 * claiming a save had just happened minutes after the fact. A confirmation is only useful
 * for a few seconds; after that it is noise.
 *
 * Errors deliberately do NOT use this. An error is something the user has to read and act
 * on, and one that vanishes before it is read is worse than one that lingers.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * How long a confirmation stays up. Long enough to notice and read a short sentence,
 * short enough that it is gone before the user starts their next action.
 */
export const TRANSIENT_MESSAGE_MS = 4000;

export type TransientMessage = {
  /** The text to render, or null when nothing should be shown. */
  message: string | null;
  /** Show `text`, restarting the countdown if something was already showing. */
  show: (text: string) => void;
  /** Hide immediately and cancel the countdown. */
  clear: () => void;
};

export function useTransientMessage(
  durationMs: number = TRANSIENT_MESSAGE_MS,
): TransientMessage {
  const [message, setMessage] = useState<string | null>(null);
  // Holds the pending countdown so a second `show` can replace it rather than leaving
  // two timers racing to hide different messages.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback(
    (text: string) => {
      cancelTimer();
      setMessage(text);
      // Scheduled here, in the event handler's callback, rather than in a `useEffect`
      // watching `message`: eslint-plugin-react-hooks' `set-state-in-effect` rule rejects
      // effect-driven state updates, and this needs no effect anyway.
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setMessage(null);
      }, durationMs);
    },
    [cancelTimer, durationMs],
  );

  const clear = useCallback(() => {
    cancelTimer();
    setMessage(null);
  }, [cancelTimer]);

  // A page can be navigated away from while a confirmation is still up; without this the
  // pending timeout would fire against an unmounted component.
  useEffect(() => cancelTimer, [cancelTimer]);

  return { message, show, clear };
}
