"use client";

/**
 * A grouped, searchable list of document types to pick from.
 *
 * Shared by the two places a user chooses documents: the requirement chooser (their
 * organization's default list, and the documents one new credit case needs) and the
 * "add a document" control on a credit case that already exists. Both used to render one
 * flat row of every type in the catalog, which was fine at five types and is not at 22.
 *
 * Purely presentational: it owns the search box and nothing else. Which types are
 * selected, and what a click means, both belong to the caller — the chooser toggles a
 * selection, while the credit case page fires off a request per click.
 */
import React, { useMemo, useState } from "react";
import { Spinner } from "./Spinner";
import { groupFileTypes, searchFileTypes } from "@/lib/fileTypeGroups";
import { fileTypeDisplayLabel } from "@/lib/fileTypes";
import type { FileType } from "@/lib/types";

export function FileTypePicker(props: {
  fileTypes: FileType[];
  /** Called with the type's id when one is clicked. */
  onPick: (id: number) => void;
  /**
   * Ids currently chosen, drawn as pressed. Omit where picking is an action rather than
   * a state (adding a document to a case), and nothing is drawn as selected.
   */
  selectedIds?: number[];
  /** Prefix for each button's label, e.g. "+" where a click adds a document. */
  prefix?: string;
  /**
   * Show a "Select all" / "Clear" pair per group. Only useful where selection is a
   * state the user builds up.
   */
  showGroupActions?: boolean;
  /** Dims every button without blocking clicks — see FileTypeChooser's Default group. */
  dimmed?: boolean;
  disabled?: boolean;
  /** Shown in place of the list when a search matches nothing. */
  emptyMessage?: string;
  searchLabel?: string;
  /** Renders a spinner beside the search box, e.g. while a pick is being saved. */
  busy?: boolean;
}) {
  const {
    fileTypes,
    onPick,
    selectedIds,
    prefix,
    showGroupActions = false,
    dimmed = false,
    disabled = false,
    emptyMessage = "No documents match your search.",
    searchLabel = "Search documents",
    busy = false,
  } = props;

  const [query, setQuery] = useState("");

  const groups = useMemo(
    () => groupFileTypes(searchFileTypes(fileTypes, query)),
    [fileTypes, query],
  );

  const selected = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);

  // The search box only earns its space once the list is long enough to be worth
  // narrowing; below that it is one more thing to read past.
  const showSearch = fileTypes.length > 8;

  /**
   * Tick every type in a group, or clear them.
   *
   * Applies only to what the current search leaves visible, so "Select all" always means
   * exactly what is on screen rather than quietly reaching past the filter.
   */
  function pickEvery(members: FileType[], shouldSelect: boolean) {
    for (const fileType of members) {
      if (selected.has(fileType.id) !== shouldSelect) onPick(fileType.id);
    }
  }

  return (
    <div className="space-y-4">
      {showSearch && (
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={searchLabel}
            placeholder="Search documents…"
            className="w-full max-w-xs rounded-md border px-3 py-1.5 text-sm"
          />
          {busy && <Spinner className="text-fg-subtle" />}
        </div>
      )}

      {groups.length === 0 ? (
        <p className="text-sm text-fg-muted">{emptyMessage}</p>
      ) : (
        groups.map((group) => {
          const allSelected =
            selectedIds !== undefined && group.fileTypes.every((f) => selected.has(f.id));

          return (
            <section key={group.key}>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  {group.label}
                </h3>
                {showGroupActions && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => pickEvery(group.fileTypes, !allSelected)}
                    className="text-xs font-medium text-fg-muted underline hover:text-fg disabled:opacity-60"
                  >
                    {allSelected ? `Clear ${group.label}` : `Select all ${group.label}`}
                  </button>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {group.fileTypes.map((fileType) => {
                  const isSelected = selected.has(fileType.id);
                  return (
                    <button
                      key={fileType.id}
                      type="button"
                      disabled={disabled}
                      // Only claim a pressed state where selection is actually a state;
                      // "+ Add" buttons are actions and would read wrongly as toggles.
                      aria-pressed={selectedIds === undefined ? undefined : isSelected}
                      onClick={() => onPick(fileType.id)}
                      // The English name as a hover tooltip, so someone who only knows
                      // the document by its English name can still confirm the match.
                      title={fileType.label_en}
                      className={[
                        "rounded-md border px-3 py-2 text-sm transition-colors disabled:opacity-60",
                        isSelected
                          ? "border-accent bg-accent text-accent-fg"
                          : "border-border-strong bg-transparent text-fg hover:bg-surface-subtle",
                        dimmed ? "opacity-50" : "",
                      ].join(" ")}
                    >
                      {prefix
                        ? `${prefix} ${fileTypeDisplayLabel(fileType)}`
                        : fileTypeDisplayLabel(fileType)}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
