"use client";

/**
 * The list of documents uploaded against a credit case or a customer.
 *
 * Shared by both detail pages so uploads look the same wherever they appear, styled to
 * match the "Required documents" checklist they sit next to — bordered rows with the
 * document type on the right — rather than the loose cards the customer page used to use.
 *
 * Newest first: after an upload the file the user just added is the one they want to see,
 * and it was previously appended to the bottom of a long list.
 *
 * Every editing control here is optional: a page that passes no `onRename` shows no
 * Rename button, and so on. That keeps read-only uses of the list honest instead of
 * offering actions that would go nowhere.
 */
import React, { useMemo, useState } from "react";
import { AiNotice } from "./AiNotice";
import { FileTypeSelect } from "./FileTypeSelect";
import { Spinner } from "./Spinner";
import { classificationStatus } from "@/lib/classification";
import { formatDate } from "@/lib/format";
import type { FileType, UploadDocument } from "@/lib/types";

/**
 * What to call a document on screen.
 *
 * Uploads routinely arrive named "scan_0012.pdf", which tells a reviewer nothing, so a
 * user-supplied friendly name always wins. The original file name is still shown in the
 * row's metadata line when it differs — the user needs to know which actual file this is.
 */
export function documentDisplayName(doc: UploadDocument): string {
  const friendly = doc.friendly_file_name?.trim();
  return friendly || doc.original_title || "Untitled document";
}

export function DocumentList(props: {
  documents: UploadDocument[] | null;
  fileTypes: FileType[] | null;
  /**
   * Correct a document's type. Omit to render the type as a read-only badge.
   * Provided wherever the user can fix a misclassification.
   */
  onChangeFileType?: (document: UploadDocument, key: string) => void;
  /**
   * Give a document a readable name, or clear it back to the original file name by
   * passing null. Omit to hide the Rename control.
   */
  onRename?: (document: UploadDocument, friendlyName: string | null) => void;
  /**
   * Ask to delete a document. The page owns the confirmation dialog — deleting is
   * irreversible, so this component only ever raises the request. Omit to hide Delete.
   */
  onDelete?: (document: UploadDocument) => void;
  /** Url of the document currently being saved, so only its badge spins. */
  savingUrl?: string | null;
  /** Url of the document whose new name is being saved, so only its row spins. */
  renamingUrl?: string | null;
  emptyMessage?: string;
}) {
  const {
    documents,
    fileTypes,
    onChangeFileType,
    onRename,
    onDelete,
    savingUrl = null,
    renamingUrl = null,
    emptyMessage = "No uploads yet.",
  } = props;

  // Which document's name is being edited, plus the text typed so far. Only one row can
  // be in edit mode at a time — two half-finished renames on screen would be confusing,
  // and there is no reason to want it.
  const [editingUrl, setEditingUrl] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const sorted = useMemo(() => {
    if (!documents) return null;
    return [...documents].sort((a, b) => {
      const at = new Date(a.uploaded_at ?? 0).getTime();
      const bt = new Date(b.uploaded_at ?? 0).getTime();
      return bt - at;
    });
  }, [documents]);

  function startRename(doc: UploadDocument) {
    setEditingUrl(doc.url);
    setDraftName(documentDisplayName(doc));
  }

  function cancelRename() {
    setEditingUrl(null);
    setDraftName("");
  }

  /**
   * Save the typed name, unless it would change nothing.
   *
   * A name matching what is already displayed means the user opened the editor and
   * thought better of it — sending that would be a pointless round trip. A name cleared
   * to blank is sent as null, which puts the document back to its original file name.
   */
  function commitRename(doc: UploadDocument) {
    const trimmed = draftName.trim();
    const unchanged = trimmed === documentDisplayName(doc);
    cancelRename();
    if (unchanged) return;
    onRename?.(doc, trimmed || null);
  }

  if (!sorted) return <div className="text-sm text-zinc-600">Loading…</div>;
  if (sorted.length === 0) return <div className="text-sm text-zinc-600">{emptyMessage}</div>;

  return (
    <>
      {/* Every document's type here was assigned by the classifier, so the caveat
          belongs to the whole list rather than to any one row. */}
      <AiNotice className="mb-3" />
      <ul className="space-y-2">
      {sorted.map((doc) => {
        const titleId = `document-title-${doc.id}`;
        const displayName = documentDisplayName(doc);
        // Shown under the title only when the friendly name hides what the file is
        // really called, so the row stays uncluttered for documents nobody renamed.
        const originalDiffers =
          Boolean(doc.original_title) && doc.original_title !== displayName;
        const editing = editingUrl === doc.url;
        const renaming = renamingUrl === doc.url;
        // "processing" means a Celery worker is still expected to answer with a file
        // type; "unclassified" means the backend has stopped waiting for it.
        const classification = classificationStatus(doc);

        return (
          <li key={doc.url} className="rounded-md border px-3 py-2 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {editing ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={draftName}
                      aria-label={`Rename ${displayName}`}
                      onChange={(e) => setDraftName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitRename(doc);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          cancelRename();
                        }
                      }}
                      className="min-w-0 flex-1 rounded-md border px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => commitRename(doc)}
                      className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-800"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={cancelRename}
                      className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-zinc-50"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div id={titleId} className="flex items-center gap-2 truncate font-medium">
                    <span className="truncate">{displayName}</span>
                    {renaming && <Spinner className="text-zinc-500" />}
                  </div>
                )}

                <div className="mt-1 text-xs text-zinc-500">
                  {doc.mimetype} · {formatDate(doc.uploaded_at)}
                  {originalDiffers && ` · ${doc.original_title}`}
                </div>
              </div>

              <div className="shrink-0">
                {classification === "processing" ? (
                  /* The classifier is still working, so there is nothing to correct yet
                     — and a value set here would be overwritten the moment it answers.
                     Same spinner the "pending AI verdict" status uses, for the same
                     reason: work is actively happening rather than waiting on a person. */
                  <span
                    role="status"
                    className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-500"
                  >
                    <Spinner size={10} />
                    Classifying…
                  </span>
                ) : onChangeFileType ? (
                  <FileTypeSelect
                    value={doc.file_type_name}
                    fileTypes={fileTypes}
                    saving={savingUrl === doc.url}
                    describedBy={titleId}
                    // Nothing is pending any more once the backend has given up, so the
                    // user is asked to label it rather than told to keep waiting.
                    emptyLabel="Not classified"
                    onChange={(key) => onChangeFileType(doc, key)}
                  />
                ) : (
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                    {doc.file_type_name ?? "Not classified"}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-2 flex items-center gap-3 text-xs font-medium">
              <a
                href={doc.file}
                target="_blank"
                rel="noreferrer"
                className="text-zinc-900 underline"
              >
                Download
              </a>
              {onRename && !editing && (
                <button
                  type="button"
                  disabled={renaming}
                  onClick={() => startRename(doc)}
                  aria-label={`Rename ${displayName}`}
                  className="text-zinc-900 underline disabled:opacity-60"
                >
                  Rename
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(doc)}
                  aria-label={`Delete ${displayName}`}
                  className="text-red-700 underline"
                >
                  Delete
                </button>
              )}
            </div>
          </li>
          );
        })}
      </ul>
    </>
  );
}
