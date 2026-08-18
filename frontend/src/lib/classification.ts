/**
 * Where an uploaded document stands with the background classifier.
 *
 * Classification runs in a Celery worker, so an upload comes back with no
 * `file_type_name` and the real answer lands 10-30 seconds later. The backend decides
 * whether a worker is still plausibly on it (see
 * `backend/storage/services/classification_state.py`) and sends that verdict as
 * `classification_status` — this module is just the frontend's reading of it.
 *
 * The frontend deliberately does NOT time this itself. How long classification may take
 * is a backend setting; a hardcoded guess here would go stale the moment it is tuned, and
 * a client-side countdown would restart every time the page is re-mounted, so a document
 * abandoned days ago would look freshly queued again.
 */
import type { UploadDocument } from "./types";

export type ClassificationStatus =
  /** The classifier answered (including answering "unknown"). */
  | "classified"
  /** No answer yet, and a worker is plausibly still on it — show a spinner. */
  | "processing"
  /** No answer, and waiting further is not useful — let the user label it by hand. */
  | "unclassified";

/** How often to re-check while at least one document is still being classified. */
export const CLASSIFICATION_POLL_MS = 4000;

/**
 * The document's classification status.
 *
 * Falls back to deriving it from `file_type_name` when the field is absent, which keeps
 * this safe against a payload built before the backend served it (an open browser tab
 * mid-deploy, or a fixture in a test).
 */
export function classificationStatus(doc: UploadDocument): ClassificationStatus {
  const reported = (doc as { classification_status?: string }).classification_status;
  if (
    reported === "classified" ||
    reported === "processing" ||
    reported === "unclassified"
  ) {
    return reported;
  }
  return doc.file_type_name ? "classified" : "processing";
}

/** True while the worker is still expected to answer for this document. */
export function isClassifying(doc: UploadDocument): boolean {
  return classificationStatus(doc) === "processing";
}

/** True when at least one document is still being classified, so polling is worthwhile. */
export function anyClassifying(documents: UploadDocument[] | null | undefined): boolean {
  return (documents ?? []).some(isClassifying);
}
