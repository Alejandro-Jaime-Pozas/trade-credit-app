"use client";

/**
 * Pick which documents a credit case requires.
 *
 * Used in two places: the last step of creating a credit case, and the Requirements
 * page where an organization edits its default list.
 *
 * The interaction is deliberately a set of boxed toggle buttons rather than checkboxes —
 * an unselected document is drawn flat against the page background, and turns blue once
 * chosen, so "what am I asking this customer for" reads at a glance.
 *
 * When a default template exists it gets its own button, separated from the individual
 * documents. Only ONE of the two can be in effect at a time, because they mean different
 * things on the backend: accepting the default keeps the case linked to the template (so
 * later template edits can be offered to it), while picking documents by hand
 * deliberately opts the case out of that.
 *
 * That exclusivity is expressed by switching, never by blocking. Clicking anything always
 * works on the first click and simply moves the active choice — the other group stays
 * visible, keeps whatever was selected in it, and just dims to show it is not what will
 * be submitted. A user who picks documents and then changes their mind about the default
 * gets there in one click, and finds their documents still selected if they switch back.
 */
import React, { useMemo, useState } from "react";
import type { FileType } from "@/lib/types";

export type FileTypeChooserSelection =
  | { mode: "default" }
  | { mode: "fileTypes"; fileTypeIds: number[]; saveAsDefault?: boolean };

/** Which of the two groups is currently the one that will be submitted. */
type ActiveGroup = "default" | "fileTypes";

export function FileTypeChooser(props: {
  fileTypes: FileType[];
  /** Document ids ticked when the chooser opens. */
  initialSelectedIds?: number[];
  /**
   * Labels for the default option. Omit entirely when there is no default template
   * yet (first-time setup), and the Default button is not rendered at all.
   */
  defaultOption?: {
    /** The documents the default template contains, shown on hover. */
    fileTypes: FileType[];
    /** Start with Default as the active choice rather than the individual documents. */
    preselected?: boolean;
  };
  /**
   * When set, the user must answer this before submitting, and the answer is returned
   * as `saveAsDefault`. Used during first-time setup to ask whether the documents they
   * just chose should also become the organization's default for future credit cases.
   */
  saveAsDefaultQuestion?: string;
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (selection: FileTypeChooserSelection) => void;
}) {
  const {
    fileTypes,
    initialSelectedIds = [],
    defaultOption,
    saveAsDefaultQuestion,
    submitLabel,
    submitting = false,
    onSubmit,
  } = props;

  const [activeGroup, setActiveGroup] = useState<ActiveGroup>(
    defaultOption?.preselected ? "default" : "fileTypes",
  );
  // Kept independently of `activeGroup` on purpose: switching to Default must not throw
  // away documents the user already picked, so switching back restores them.
  const [selectedIds, setSelectedIds] = useState<number[]>(initialSelectedIds);
  const [showDefaultInfo, setShowDefaultInfo] = useState(false);
  const [saveAsDefault, setSaveAsDefault] = useState<boolean | null>(null);

  const usingDefault = activeGroup === "default";

  // Only asked during first-time setup, and only once documents are actually chosen.
  const mustAnswerSaveAsDefault =
    Boolean(saveAsDefaultQuestion) && !usingDefault && selectedIds.length > 0;

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (usingDefault) return true;
    if (selectedIds.length === 0) return false;
    if (mustAnswerSaveAsDefault && saveAsDefault === null) return false;
    return true;
  }, [
    submitting,
    usingDefault,
    selectedIds,
    mustAnswerSaveAsDefault,
    saveAsDefault,
  ]);

  /** Clicking a document always makes documents the active choice, in one click. */
  function pickFileType(id: number) {
    setActiveGroup("fileTypes");
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((existing) => existing !== id)
        : [...current, id],
    );
  }

  /** Clicking Default always makes it the active choice, in one click. */
  function pickDefault() {
    setActiveGroup("default");
  }

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit(
      usingDefault
        ? { mode: "default" }
        : {
            mode: "fileTypes",
            fileTypeIds: selectedIds,
            saveAsDefault: saveAsDefault ?? false,
          },
    );
  }

  return (
    <div className="space-y-6">
      {defaultOption && (
        <div className="border-b pb-6">
          <div className="relative inline-block">
            <button
              type="button"
              aria-pressed={usingDefault}
              onClick={pickDefault}
              onMouseEnter={() => setShowDefaultInfo(true)}
              onMouseLeave={() => setShowDefaultInfo(false)}
              onFocus={() => setShowDefaultInfo(true)}
              onBlur={() => setShowDefaultInfo(false)}
              className={[
                "rounded-md border px-4 py-2 text-sm font-medium transition-colors",
                usingDefault
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-zinc-300 bg-transparent text-zinc-900 hover:bg-zinc-50",
                // Dimmed while documents are the active choice, but still clickable —
                // one click brings it back.
                usingDefault ? "" : "opacity-50",
              ].join(" ")}
            >
              Default
            </button>

            {showDefaultInfo && (
              <div
                role="tooltip"
                className="absolute left-0 top-full z-10 mt-2 w-64 rounded-md border bg-white p-3 text-xs shadow-lg"
              >
                <p className="font-medium text-zinc-900">
                  Your default required documents
                </p>
                {defaultOption.fileTypes.length === 0 ? (
                  <p className="mt-1 text-zinc-600">No documents yet.</p>
                ) : (
                  <ul className="mt-1 space-y-0.5 text-zinc-600">
                    {defaultOption.fileTypes.map((fileType) => (
                      <li key={fileType.id}>{fileType.label_en}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <p className="mt-2 text-xs text-zinc-600">
            Use your organization&apos;s default list. Hover to see what it includes.
          </p>
        </div>
      )}

      <div>
        {defaultOption && (
          <p className="mb-3 text-sm font-medium text-zinc-900">
            Or choose documents for this credit case
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {fileTypes.map((fileType) => {
            const selected = selectedIds.includes(fileType.id);
            return (
              <button
                key={fileType.id}
                type="button"
                aria-pressed={selected}
                onClick={() => pickFileType(fileType.id)}
                className={[
                  "rounded-md border px-3 py-2 text-sm transition-colors",
                  selected
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-zinc-300 bg-transparent text-zinc-900 hover:bg-zinc-50",
                  // Selections stay visible (still blue) while Default is active, just
                  // dimmed, so switching back shows the user exactly what they had.
                  usingDefault ? "opacity-50" : "",
                ].join(" ")}
              >
                {fileType.label_en}
              </button>
            );
          })}
        </div>
      </div>

      {mustAnswerSaveAsDefault && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-sm font-medium text-zinc-900">
            {saveAsDefaultQuestion}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              aria-pressed={saveAsDefault === true}
              onClick={() => setSaveAsDefault(true)}
              className={[
                "rounded-md border px-4 py-2 text-sm font-medium transition-colors",
                saveAsDefault === true
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100",
              ].join(" ")}
            >
              Yes
            </button>
            <button
              type="button"
              aria-pressed={saveAsDefault === false}
              onClick={() => setSaveAsDefault(false)}
              className={[
                "rounded-md border px-4 py-2 text-sm font-medium transition-colors",
                saveAsDefault === false
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100",
              ].join(" ")}
            >
              No
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={!canSubmit}
        onClick={handleSubmit}
        className={[
          "rounded-md px-4 py-2 text-sm font-medium text-white transition-colors",
          canSubmit
            ? "bg-green-600 hover:bg-green-700"
            : "cursor-not-allowed bg-zinc-300",
        ].join(" ")}
      >
        {submitting ? "Saving…" : submitLabel}
      </button>
    </div>
  );
}
