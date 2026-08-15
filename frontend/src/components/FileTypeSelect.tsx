"use client";

/**
 * A searchable single-select for a document's file type.
 *
 * Exists because GPT classification is fallible, and a mislabelled document silently
 * fails to satisfy the requirement it should — so the user needs a way to correct it.
 * Search rather than a plain `<select>` because the catalog grows over time and
 * scanning a long list for "constancia de situación fiscal" is slow.
 *
 * `unknown` is offered explicitly: it is the classifier's own "no idea" bucket, and a
 * user who realises they mislabelled something needs a way back to it.
 */
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Spinner } from "./Spinner";
import { fileTypeLabel } from "@/lib/fileTypes";
import type { FileType } from "@/lib/types";

export function FileTypeSelect(props: {
  /** Current file type key, e.g. "bank_statement" or "unknown". */
  value: string | null | undefined;
  fileTypes: FileType[] | null;
  onChange: (key: string) => void;
  /** Shows a spinner in place of the caret while the change is being saved. */
  saving?: boolean;
  disabled?: boolean;
  /** Names the control for screen readers, e.g. the document's filename. */
  describedBy?: string;
}) {
  const { value, fileTypes, onChange, saving = false, disabled = false, describedBy } = props;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const options = useMemo(() => {
    const catalog = (fileTypes ?? []).map((f) => ({ key: f.key, label: f.label_en }));
    // Sorted by what the user reads, not by the underlying key.
    catalog.sort((a, b) => a.label.localeCompare(b.label, "es-MX", { sensitivity: "base" }));
    return [...catalog, { key: "unknown", label: "Unknown / unclassified" }];
  }, [fileTypes]);

  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // useCallback so these read `buttonRef` only when invoked from an event, never during
  // render (react-hooks/refs).
  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    setQuery("");
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  // Deliberately does NOT touch `buttonRef`: it is called from inside the rendered
  // option list, and react-hooks/refs (rightly) rejects a ref being reachable from
  // there. Keyboard commits restore focus themselves, below.
  const commit = useCallback(
    (key: string) => {
      setOpen(false);
      setQuery("");
      if (key !== value) onChange(key);
    },
    [onChange, value],
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
      return;
    }
    if (matching.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % matching.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + matching.length) % matching.length);
        break;
      case "Enter": {
        e.preventDefault();
        const option = matching[activeIndex];
        if (option) {
          commit(option.key);
          // Keyboard users must land back on the trigger, not on nothing.
          buttonRef.current?.focus();
        }
        break;
      }
    }
  }

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled || saving}
        aria-label="Change file type"
        aria-describedby={describedBy}
        aria-expanded={open}
        onClick={() => {
          if (open) {
            close(false);
          } else {
            setOpen(true);
            setQuery("");
            setActiveIndex(0);
          }
        }}
        className="flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-60"
      >
        {fileTypeLabel(value, fileTypes)}
        {saving ? <Spinner size={10} /> : <span aria-hidden="true">▾</span>}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-64 rounded-md border bg-white shadow-lg">
          <div className="border-b p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                // Reset the highlight here rather than in an effect —
                // react-hooks/set-state-in-effect rejects setState inside useEffect.
                setActiveIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search document types…"
              aria-label="Search document types"
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded
              aria-controls="file-type-listbox"
              className="w-full rounded border px-2 py-1.5 text-sm font-normal"
            />
          </div>

          <div
            id="file-type-listbox"
            role="listbox"
            aria-label="Document types"
            className="max-h-56 overflow-y-auto py-1"
          >
            {matching.length === 0 ? (
              <div className="px-3 py-2 text-sm text-zinc-500">No matching types.</div>
            ) : (
              matching.map((option, index) => (
                <button
                  key={option.key}
                  type="button"
                  role="option"
                  aria-selected={option.key === value}
                  onMouseEnter={() => setActiveIndex(index)}
                  // Keeps focus in the search input so the blur handler above doesn't
                  // close the panel before the click lands (macOS doesn't focus
                  // buttons on mousedown).
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commit(option.key)}
                  className={[
                    "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm",
                    index === activeIndex ? "bg-zinc-100" : "hover:bg-zinc-50",
                  ].join(" ")}
                >
                  <span className="truncate">{option.label}</span>
                  {option.key === value && (
                    <span aria-hidden="true" className="text-zinc-500">
                      ✓
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
