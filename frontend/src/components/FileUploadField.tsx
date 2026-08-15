"use client";

/**
 * Pick files and upload them, with no separate Upload button.
 *
 * Choosing files in the OS picker IS the instruction to upload — the extra "now click
 * Upload" step was a second confirmation of something the user had already confirmed,
 * and files sat un-uploaded whenever it was missed.
 *
 * The native `<input type="file">` is visually hidden behind a styled label rather than
 * restyled, because its appearance can't be controlled cross-browser but its behaviour
 * (keyboard, drag/drop, accessibility) is worth keeping.
 *
 * In-flight uploads are recorded in `lib/uploadTracker`, outside React, so the
 * "Uploading…" state survives navigating away and back. Previously that state was local,
 * so returning to the page showed an idle button while the backend was still working.
 */
import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Spinner } from "./Spinner";
import {
  getEmptyUploadActivity,
  getUploadActivity,
  subscribeToUploads,
  trackUpload,
} from "@/lib/uploadTracker";

export function FileUploadField(props: {
  /** Uploads the chosen files. Rejecting shows the error inline. */
  onUpload: (files: File[]) => Promise<void>;
  /**
   * Identifies what these uploads belong to — normally the credit case or customer URL.
   * Uploads are tracked against it, so leaving the page and returning still shows them
   * running. Omit only where there is nothing stable to key on.
   */
  scope?: string;
  /**
   * Called when uploads started elsewhere (before this component mounted) finish, so the
   * page can refresh. Not called for uploads this component awaited itself — those are
   * already handled by `onUpload` resolving.
   */
  onBackgroundUploadsSettled?: () => void;
  /** Accept more than one file at a time. */
  multiple?: boolean;
  /** Blocks selection, e.g. while the page is still loading its data. */
  disabled?: boolean;
  label?: string;
}) {
  const {
    onUpload,
    scope,
    onBackgroundUploadsSettled,
    multiple = false,
    disabled = false,
    label,
  } = props;

  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  // True only for an upload this component instance is awaiting. Uploads started by an
  // earlier mount show through `activity` instead.
  const [awaitingOwnUpload, setAwaitingOwnUpload] = useState(false);
  // Names for the upload this instance started, so the list still shows without a scope.
  const [ownFileNames, setOwnFileNames] = useState<string[]>([]);

  const activity = useSyncExternalStore(
    subscribeToUploads,
    () => (scope ? getUploadActivity(scope) : getEmptyUploadActivity()),
    getEmptyUploadActivity,
  );

  const uploading = awaitingOwnUpload || activity.count > 0;
  // Prefer the tracker's list — it covers uploads this instance never started.
  const uploadingNames = activity.fileNames.length > 0 ? activity.fileNames : ownFileNames;

  // Uploads that were still running when the user came back to this page finish without
  // anything here awaiting them, so the page is told to refresh when they settle.
  const wasActive = useRef(false);
  useEffect(() => {
    if (wasActive.current && activity.count === 0 && !awaitingOwnUpload) {
      onBackgroundUploadsSettled?.();
    }
    wasActive.current = activity.count > 0;
  }, [activity.count, awaitingOwnUpload, onBackgroundUploadsSettled]);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    // Reset immediately so picking the SAME file again still fires a change event —
    // otherwise a failed upload could not be retried without choosing something else.
    e.target.value = "";
    if (files.length === 0) return;

    const names = files.map((f) => f.name);
    setAwaitingOwnUpload(true);
    setOwnFileNames(names);
    setError(null);
    try {
      // The tracker owns the promise, so the request survives this component unmounting.
      if (scope) {
        await trackUpload(scope, names, () => onUpload(files));
      } else {
        await onUpload(files);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setAwaitingOwnUpload(false);
      setOwnFileNames([]);
    }
  }

  const buttonLabel =
    label ?? (multiple ? "Choose files to upload" : "Choose a file to upload");

  return (
    <div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple={multiple}
        disabled={disabled || uploading}
        onChange={(e) => void handleChange(e)}
        className="sr-only"
      />
      <label
        htmlFor={inputId}
        className={[
          "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium",
          disabled || uploading
            ? "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-400"
            : "cursor-pointer border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50",
        ].join(" ")}
      >
        {uploading && <Spinner />}
        {uploading ? "Uploading…" : buttonLabel}
      </label>

      {uploading && uploadingNames.length > 0 && (
        // `aria-live` so a screen reader announces the upload starting, since the
        // spinner itself is deliberately silent.
        <p aria-live="polite" className="mt-2 text-xs text-zinc-500">
          Uploading {uploadingNames.join(", ")}
        </p>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-700">
          {error}{" "}
          <button
            type="button"
            onClick={() => {
              setError(null);
              inputRef.current?.click();
            }}
            className="underline"
          >
            Try again
          </button>
        </p>
      )}
    </div>
  );
}
