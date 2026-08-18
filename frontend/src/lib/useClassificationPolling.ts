"use client";

/**
 * Keeps re-reading documents while the background classifier is still working.
 *
 * Classification happens in a Celery worker after the upload request has already
 * answered, so the file type arrives on the server some seconds later with nothing to
 * tell the browser about it. Without this the user would sit looking at "Pending
 * classification" until they reloaded the page by hand.
 *
 * Polling rather than a live connection (WebSocket/SSE): the wait is a handful of seconds
 * on a page the user is already looking at, and a push channel would mean new
 * infrastructure — a socket layer in Django and a second protocol to secure per
 * organization — for a payoff of a few seconds' latency.
 *
 * It stops as soon as no document is left processing, so an idle page makes no requests
 * at all.
 */
import { useEffect, useRef, useState } from "react";
import { anyClassifying, CLASSIFICATION_POLL_MS } from "./classification";
import type { UploadDocument } from "./types";

export function useClassificationPolling(args: {
  /** The documents on screen. Polling runs only while one of them is processing. */
  documents: UploadDocument[] | null;
  /** Re-read the documents (and anything else a finished classification can change). */
  onRefresh: () => void | Promise<void>;
  /** Set false to hold off, e.g. while the page's own data is still loading. */
  enabled?: boolean;
  intervalMs?: number;
}): void {
  const {
    documents,
    onRefresh,
    enabled = true,
    intervalMs = CLASSIFICATION_POLL_MS,
  } = args;

  // Pages pass a plain (unmemoized) function, which is a new value on every render. Held
  // in a ref so the interval below is not torn down and rebuilt each time — the timer
  // should depend on WHETHER to poll, never on the identity of the callback.
  const refreshRef = useRef(onRefresh);
  useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  // Bumped on each tick purely to force a re-render, so a row stops showing a spinner
  // once the backend reports it is no longer processing even if nothing else changed.
  const [, setTick] = useState(0);

  const waiting = enabled && anyClassifying(documents);

  useEffect(() => {
    if (!waiting) return;

    const id = setInterval(() => {
      setTick((t) => t + 1);
      void refreshRef.current();
    }, intervalMs);

    // Cleared when the last document finishes, and on unmount — a page the user has
    // navigated away from must not keep firing requests.
    return () => clearInterval(id);
  }, [waiting, intervalMs]);
}
