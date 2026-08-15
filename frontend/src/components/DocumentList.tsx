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
 */
import React, { useMemo } from "react";
import { AiNotice } from "./AiNotice";
import { FileTypeSelect } from "./FileTypeSelect";
import { formatDate } from "@/lib/format";
import type { FileType, UploadDocument } from "@/lib/types";

export function DocumentList(props: {
  documents: UploadDocument[] | null;
  fileTypes: FileType[] | null;
  /**
   * Correct a document's type. Omit to render the type as a read-only badge.
   * Provided wherever the user can fix a misclassification.
   */
  onChangeFileType?: (document: UploadDocument, key: string) => void;
  /** Url of the document currently being saved, so only its badge spins. */
  savingUrl?: string | null;
  emptyMessage?: string;
}) {
  const {
    documents,
    fileTypes,
    onChangeFileType,
    savingUrl = null,
    emptyMessage = "No uploads yet.",
  } = props;

  const sorted = useMemo(() => {
    if (!documents) return null;
    return [...documents].sort((a, b) => {
      const at = new Date(a.uploaded_at ?? 0).getTime();
      const bt = new Date(b.uploaded_at ?? 0).getTime();
      return bt - at;
    });
  }, [documents]);

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
        return (
          <li key={doc.url} className="rounded-md border px-3 py-2 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div id={titleId} className="truncate font-medium">
                  {doc.original_title}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {doc.mimetype} · {formatDate(doc.uploaded_at)}
                </div>
              </div>

              <div className="shrink-0">
                {onChangeFileType ? (
                  <FileTypeSelect
                    value={doc.file_type_name}
                    fileTypes={fileTypes}
                    saving={savingUrl === doc.url}
                    describedBy={titleId}
                    onChange={(key) => onChangeFileType(doc, key)}
                  />
                ) : (
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                    {doc.file_type_name ?? "Pending classification"}
                  </span>
                )}
              </div>
            </div>

            <a
              href={doc.file}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-xs font-medium text-zinc-900 underline"
            >
              Download
            </a>
          </li>
          );
        })}
      </ul>
    </>
  );
}
