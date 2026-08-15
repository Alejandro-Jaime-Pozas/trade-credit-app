/**
 * Keeps track of uploads that are still running, independently of any component.
 *
 * WHY THIS EXISTS: the "Uploading…" indicator used to live in `FileUploadField`'s own
 * state. Navigating to another page unmounted it, so coming back showed an idle upload
 * button while the backend was still busy classifying the file — the work was happening,
 * but the app claimed otherwise.
 *
 * This store lives at module scope, so it survives route changes for as long as the tab
 * is open. It also OWNS the upload promise: the request keeps running even if the
 * component that started it has gone away.
 *
 * Uploads are grouped by `scope` — a string identifying what they are attached to,
 * normally a credit case or customer URL. That way returning to a customer's page shows
 * only that customer's uploads, not somebody else's.
 *
 * Not persisted to storage on purpose: a full page reload tears down the fetch too, so
 * a remembered "still uploading" flag would be a lie. This survives client-side
 * navigation, which is the case that was broken.
 */

/** What a subscriber sees for one scope. */
export type UploadActivity = {
  /** How many uploads are in flight for this scope. */
  count: number;
  /** Names of the files currently going up, for display. */
  fileNames: string[];
};

const EMPTY: UploadActivity = { count: 0, fileNames: [] };

/** In-flight uploads per scope, keyed by an id unique to each call. */
const inFlight = new Map<string, Map<number, string[]>>();

/**
 * Cached snapshot per scope.
 *
 * `useSyncExternalStore` re-renders whenever getSnapshot returns a new reference, so the
 * snapshot must be a stable object that only changes when the data actually does —
 * building a fresh object per call would loop forever.
 */
const snapshots = new Map<string, UploadActivity>();

const listeners = new Set<() => void>();

let nextId = 1;

function rebuildSnapshot(scope: string): void {
  const uploads = inFlight.get(scope);
  if (!uploads || uploads.size === 0) {
    snapshots.delete(scope);
    return;
  }
  snapshots.set(scope, {
    count: uploads.size,
    fileNames: Array.from(uploads.values()).flat(),
  });
}

function emit(): void {
  for (const listener of listeners) listener();
}

/** Subscribe to changes. Returns the unsubscribe function. */
export function subscribeToUploads(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The current activity for one scope. Stable reference between changes. */
export function getUploadActivity(scope: string): UploadActivity {
  return snapshots.get(scope) ?? EMPTY;
}

/** Server render has no uploads in flight, and must return a stable reference. */
export function getEmptyUploadActivity(): UploadActivity {
  return EMPTY;
}

/**
 * Run an upload while the store counts it as in flight.
 *
 * Rejections are re-thrown so the caller can still show an error, but the count is
 * always released — a failed upload must not leave the button spinning forever.
 */
export async function trackUpload<T>(
  scope: string,
  fileNames: string[],
  run: () => Promise<T>,
): Promise<T> {
  const id = nextId++;

  let uploads = inFlight.get(scope);
  if (!uploads) {
    uploads = new Map();
    inFlight.set(scope, uploads);
  }
  uploads.set(id, fileNames);
  rebuildSnapshot(scope);
  emit();

  try {
    return await run();
  } finally {
    const current = inFlight.get(scope);
    if (current) {
      current.delete(id);
      if (current.size === 0) inFlight.delete(scope);
    }
    rebuildSnapshot(scope);
    emit();
  }
}

/** Test helper: forget everything. Not used by application code. */
export function resetUploadTracker(): void {
  inFlight.clear();
  snapshots.clear();
  listeners.clear();
  nextId = 1;
}
