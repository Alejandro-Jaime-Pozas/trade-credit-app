"use client";

/**
 * A table header cell with a sort button and a filter button.
 *
 * Used by the credit cases table (`src/app/credit-cases/page.tsx`). All the
 * decision logic (the sort cycle, option searching, selection toggling) lives
 * in `src/lib/tableControls.ts`; this file only renders it and handles
 * mouse/keyboard interaction.
 *
 * Two design points worth knowing before editing:
 *
 * 1. This component owns the dropdown's *search text* (local state) but NOT
 *    the *selected values* — those are passed in as props and owned by the
 *    page. That separation is what guarantees the behaviour the table needs:
 *    clearing or retyping the search box physically cannot unselect anything.
 *
 * 2. The dropdown panel is rendered through a portal, positioned `fixed`
 *    against the filter button. It used to be an absolutely-positioned child
 *    of the header cell, but the table sits inside an `overflow-x-auto`
 *    wrapper, and a scroll container clips its descendants — so on the
 *    leftmost column the panel was sliced off at the table's edge.
 */

import React, { useCallback, useEffect, useRef, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { clampColumnWidth } from "@/lib/columnWidths";
import {
  searchOptions,
  type FilterOption,
  type SortDirection,
} from "@/lib/tableControls";

/** Panel width in px. Must match the inline width applied to the panel. */
const PANEL_WIDTH = 256;
/** Minimum gap kept between the panel and the edges of the viewport. */
const VIEWPORT_MARGIN = 8;
/** Roughly the height of the panel's search box + footer, excluding the list. */
const PANEL_CHROME_HEIGHT = 90;

type PanelPosition = { top: number; left: number; maxListHeight: number };

type TableColumnHeaderProps = {
  /** Column heading text, e.g. "Status". */
  label: string;
  /** Used to build unique DOM ids for the ARIA wiring. */
  columnId: string;
  /** Current sort direction for this column, or null when it isn't sorted. */
  sortDirection: SortDirection | null;
  /** Advance this column's sort (asc -> desc -> default). */
  onToggleSort: () => void;
  /**
   * Every value the user may filter this column by, with match counts.
   * Omit to make the column sort-only (no filter button, e.g. the ID column,
   * where a list of every id would be one option per row).
   */
  options?: FilterOption[];
  /** Currently selected option values for this column. */
  selected?: string[];
  /** Toggle one option value on/off. */
  onToggleValue?: (value: string) => void;
  /** Clear every selection for this column. */
  onClearColumn?: () => void;
  /** Current width in px, or undefined to let the column size itself. */
  width?: number;
  /**
   * Share of the table this column takes when the user hasn't resized it, as a
   * percentage. Without one the browser hands ALL the slack in a wide window to a single
   * column instead of spreading it, which is what made the ID column balloon.
   */
  defaultWidthPercent?: number;
  /** Called continuously while the user drags this column's resize handle. */
  onResize?: (width: number) => void;
  /** Called once when the drag ends, so the caller can persist the new width. */
  onResizeEnd?: () => void;
  /**
   * Reorder support. Passing `onReorder` makes the heading draggable; the id handed
   * back is the column that was dragged onto this one.
   *
   * Mouse-only by nature, which is why the Columns menu carries Move up/Move down —
   * without it a keyboard user could not reorder the table at all.
   */
  onReorder?: (draggedColumnId: string) => void;
  /** True while some column is mid-drag, so every heading can show a drop target. */
  dragging?: boolean;
};

/** The drag payload's MIME type. Namespaced so nothing else on the page claims it. */
const COLUMN_DRAG_TYPE = "application/x-tcapp-column";

/** Maps the sort state onto the glyph and the label read by screen readers. */
function sortAffordance(direction: SortDirection | null, label: string) {
  if (direction === "asc") {
    return { glyph: "▲", ariaLabel: `${label}: sorted ascending. Sort descending`, ariaSort: "ascending" as const };
  }
  if (direction === "desc") {
    return { glyph: "▼", ariaLabel: `${label}: sorted descending. Clear sort`, ariaSort: "descending" as const };
  }
  return { glyph: "⇅", ariaLabel: `Sort by ${label} ascending`, ariaSort: "none" as const };
}

/**
 * Where to put the panel so it stays fully on screen.
 *
 * Right-aligned to the button by default (so it reads as belonging to this
 * column), then clamped into the viewport — which is what keeps the leftmost
 * column's panel from running off the left edge.
 */
function computePanelPosition(button: HTMLElement): PanelPosition {
  const rect = button.getBoundingClientRect();
  const maxLeft = Math.max(
    VIEWPORT_MARGIN,
    window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN,
  );
  return {
    top: rect.bottom + 4,
    left: Math.min(Math.max(rect.right - PANEL_WIDTH, VIEWPORT_MARGIN), maxLeft),
    // Let the option list use the space actually available below the button
    // rather than a fixed height that could hang off the bottom of the screen.
    maxListHeight: Math.max(
      120,
      window.innerHeight - rect.bottom - PANEL_CHROME_HEIGHT - VIEWPORT_MARGIN * 2,
    ),
  };
}

export function TableColumnHeader({
  label,
  columnId,
  sortDirection,
  onToggleSort,
  options,
  selected = [],
  onToggleValue,
  onClearColumn,
  width,
  defaultWidthPercent,
  onResize,
  onResizeEnd,
  onReorder,
  dragging = false,
}: TableColumnHeaderProps) {
  /** A column without an option list gets a sort button only. */
  const filterable = options !== undefined;
  const cellRef = useRef<HTMLTableCellElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  // Whether a dragged column is currently hovering over this one, for the drop line.
  const [dropTarget, setDropTarget] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const listboxId = `${columnId}-filter-listbox`;
  const { glyph, ariaLabel, ariaSort } = sortAffordance(sortDirection, label);

  // Options matching the current search text.
  const matching = useMemo(() => searchOptions(options ?? [], query), [options, query]);

  // Selected options the search text would otherwise hide. They stay visible,
  // pinned above the results, so a user hunting for their second value can
  // always see the first one is still active.
  const pinned = useMemo(() => {
    if (!query.trim()) return [];
    const visible = new Set(matching.map((o) => o.value));
    return (options ?? []).filter(
      (o) => selected.includes(o.value) && !visible.has(o.value),
    );
  }, [options, matching, selected, query]);

  // Flat list backing keyboard navigation, in the same order as rendered.
  const navigable = useMemo(() => [...pinned, ...matching], [pinned, matching]);

  const closeDropdown = useCallback((returnFocus: boolean) => {
    setOpen(false);
    setQuery("");
    setPosition(null);
    if (returnFocus) filterButtonRef.current?.focus();
  }, []);

  function openDropdown() {
    const button = filterButtonRef.current;
    if (!button) return;
    // Measured here rather than in an effect so the panel is positioned on its
    // very first paint (and so no setState happens inside an effect body).
    setPosition(computePanelPosition(button));
    setOpen(true);
    setQuery("");
    setActiveIndex(0);
  }

  // While the panel is open it lives outside the header cell in a portal, so
  // the usual "did focus leave this subtree?" blur check can't see it. Watch
  // the document instead, and keep the fixed position in sync with scrolling.
  useEffect(() => {
    if (!open) return;

    const isInside = (target: EventTarget | null) =>
      target instanceof Node &&
      (filterButtonRef.current?.contains(target) === true ||
        panelRef.current?.contains(target) === true);

    const handlePointerDown = (e: MouseEvent) => {
      if (!isInside(e.target)) closeDropdown(false);
    };
    const handleFocusIn = (e: FocusEvent) => {
      if (!isInside(e.target)) closeDropdown(false);
    };
    const reposition = () => {
      const button = filterButtonRef.current;
      if (button) setPosition(computePanelPosition(button));
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    window.addEventListener("resize", reposition);
    // Capture phase so the table's own horizontal scrolling counts, not just
    // the window's.
    window.addEventListener("scroll", reposition, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, closeDropdown]);

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeDropdown(true);
      return;
    }
    if (navigable.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % navigable.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + navigable.length) % navigable.length);
        break;
      case "Enter": {
        e.preventDefault();
        const option = navigable[activeIndex];
        // Toggling deliberately leaves the dropdown open and the search text
        // untouched, so the user can keep picking values.
        if (option) onToggleValue?.(option.value);
        break;
      }
    }
  }

  /** One checkbox row in the dropdown. */
  function renderOption(option: FilterOption, index: number) {
    const isSelected = selected.includes(option.value);
    const isActive = index === activeIndex;
    return (
      <button
        key={option.value}
        id={`${columnId}-filter-option-${index}`}
        type="button"
        role="option"
        aria-selected={isSelected}
        onMouseEnter={() => setActiveIndex(index)}
        // Prevent the mousedown from moving focus out of the search input.
        // Without this, macOS browsers don't focus the clicked button, focus
        // leaves the panel, and the dropdown closes before the click lands.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onToggleValue?.(option.value)}
        className={[
          "flex w-full items-center gap-2 px-3 py-2 text-left text-sm normal-case tracking-normal",
          isActive ? "bg-surface-muted" : "hover:bg-surface-subtle",
        ].join(" ")}
      >
        <span
          aria-hidden="true"
          className={[
            "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] leading-none",
            isSelected ? "border-primary bg-primary text-primary-fg" : "border-border-strong bg-surface",
          ].join(" ")}
        >
          {isSelected ? "✓" : ""}
        </span>
        <span className="flex-1 truncate font-normal text-fg">{option.label}</span>
        <span className="shrink-0 text-xs text-fg-subtle">{option.count}</span>
      </button>
    );
  }

  const panel = (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        width: PANEL_WIDTH,
      }}
      className="z-50 rounded-md border bg-surface shadow-lg"
    >
      <div className="border-b p-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            // Reset the highlight here rather than in an effect — eslint's
            // react-hooks/set-state-in-effect rule (correctly) rejects
            // synchronous setState inside useEffect.
            setActiveIndex(0);
          }}
          onKeyDown={handleSearchKeyDown}
          placeholder={`Search ${label.toLowerCase()}…`}
          aria-label={`Search ${label} values`}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded
          aria-controls={listboxId}
          aria-activedescendant={
            navigable[activeIndex] ? `${columnId}-filter-option-${activeIndex}` : undefined
          }
          className="w-full rounded border px-2 py-1.5 text-sm font-normal normal-case tracking-normal"
        />
      </div>

      <div
        id={listboxId}
        role="listbox"
        aria-multiselectable="true"
        aria-label={`${label} filter values`}
        style={{ maxHeight: position?.maxListHeight ?? 256 }}
        className="overflow-y-auto py-1"
      >
        {navigable.length === 0 ? (
          <div className="px-3 py-2 text-sm font-normal normal-case tracking-normal text-fg-subtle">
            No matching values.
          </div>
        ) : (
          <>
            {pinned.length > 0 && (
              <div role="group" aria-label="Selected values">
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-fg-faint">
                  Selected
                </div>
                {pinned.map((option, index) => renderOption(option, index))}
                <div className="my-1 border-t" />
              </div>
            )}
            <div role="group" aria-label="Matching values">
              {matching.map((option, index) => renderOption(option, pinned.length + index))}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-between border-t px-2 py-2">
        <span className="text-xs font-normal normal-case tracking-normal text-fg-subtle">
          {selected.length} selected
        </span>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClearColumn}
          disabled={selected.length === 0}
          className="rounded px-2 py-1 text-xs font-normal normal-case tracking-normal text-fg-muted hover:bg-surface-muted disabled:opacity-40"
        >
          Clear
        </button>
      </div>
    </div>
  );

  /**
   * Drag the column edge to resize.
   *
   * Tracked on `document` rather than the handle, so the pointer can leave the thin
   * handle mid-drag (which it always does) without the resize stopping. The starting
   * width comes from the rendered cell, so the first drag on a never-resized column
   * continues from where it actually is rather than jumping.
   */
  function handleResizeStart(e: React.PointerEvent<HTMLDivElement>) {
    if (!onResize) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = width ?? cellRef.current?.getBoundingClientRect().width ?? 0;

    const onPointerMove = (move: PointerEvent) => {
      onResize(clampColumnWidth(startWidth + (move.clientX - startX)));
    };
    const onPointerUp = () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      onResizeEnd?.();
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }

  /** Keyboard resizing, so this isn't a mouse-only feature. */
  function handleResizeKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!onResize) return;
    const step = e.shiftKey ? 40 : 10;
    const current = width ?? cellRef.current?.getBoundingClientRect().width ?? 0;

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onResize(clampColumnWidth(current - step));
      onResizeEnd?.();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onResize(clampColumnWidth(current + step));
      onResizeEnd?.();
    }
  }

  return (
    <th
      ref={cellRef}
      className={[
        "relative px-4 py-3",
        dropTarget ? "bg-surface-strong" : "",
        // While anything is being dragged every other heading is a valid target, so
        // saying so up front beats making the user discover it by trial.
        dragging && !dropTarget ? "bg-surface-muted/40" : "",
      ].join(" ")}
      aria-sort={ariaSort}
      scope="col"
      onDragOver={
        onReorder
          ? (e) => {
              // Both are required: without preventDefault the browser refuses the drop
              // outright, and the effect is what turns the cursor into a move arrow.
              if (!e.dataTransfer.types.includes(COLUMN_DRAG_TYPE)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDropTarget(true);
            }
          : undefined
      }
      onDragLeave={onReorder ? () => setDropTarget(false) : undefined}
      onDrop={
        onReorder
          ? (e) => {
              e.preventDefault();
              setDropTarget(false);
              const draggedId = e.dataTransfer.getData(COLUMN_DRAG_TYPE);
              if (draggedId) onReorder(draggedId);
            }
          : undefined
      }
      // A width the user dragged wins outright. Otherwise the percentage lets every
      // column share the extra space in a wide window. The table stays `auto` layout,
      // so these are proportions rather than hard limits — a column still refuses to
      // squash below its content on a narrow screen, and the table scrolls instead.
      style={
        width
          ? { width, minWidth: width }
          : defaultWidthPercent
            ? { width: `${defaultWidthPercent}%` }
            : undefined
      }
    >
      <div className="flex items-center gap-1">
        {/* The heading text itself is the drag handle. A separate grip would be one more
            thing to aim at in a row that already holds a sort button, a filter button
            and a resize edge. */}
        <span
          draggable={Boolean(onReorder)}
          onDragStart={
            onReorder
              ? (e) => {
                  e.dataTransfer.setData(COLUMN_DRAG_TYPE, columnId);
                  e.dataTransfer.effectAllowed = "move";
                }
              : undefined
          }
          className={onReorder ? "cursor-grab select-none active:cursor-grabbing" : ""}
        >
          {label}
        </span>

        <button
          type="button"
          onClick={onToggleSort}
          aria-label={ariaLabel}
          title={ariaLabel}
          className={[
            "flex h-7 w-7 items-center justify-center rounded text-sm leading-none hover:bg-surface-strong",
            sortDirection ? "text-fg" : "text-fg-faint",
          ].join(" ")}
        >
          {glyph}
        </button>

        {filterable && (
        <button
          ref={filterButtonRef}
          type="button"
          onClick={() => (open ? closeDropdown(false) : openDropdown())}
          aria-label={
            selected.length > 0
              ? `Filter by ${label} (${selected.length} selected)`
              : `Filter by ${label}`
          }
          aria-expanded={open}
          title={`Filter by ${label}`}
          className={[
            "flex h-7 min-w-7 items-center justify-center gap-1 rounded px-1.5 leading-none hover:bg-surface-strong",
            selected.length > 0 ? "text-fg" : "text-fg-faint",
          ].join(" ")}
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 fill-current">
            <path d="M1.5 2.5h13L9.5 8.4V14L6.5 12.4V8.4z" />
          </svg>
          {selected.length > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 text-primary-fg">
              {selected.length}
            </span>
          )}
        </button>
        )}
      </div>

      {onResize && (
        // Sits on the column's right edge. `separator` with an orientation and value is
        // the ARIA pattern for a resize grip, and it is focusable so the width can be
        // changed with the arrow keys too.
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${label} column`}
          tabIndex={0}
          onPointerDown={handleResizeStart}
          onKeyDown={handleResizeKeyDown}
          onDoubleClick={() => {
            // Double-click clears this column's stored width, letting the table size it
            // again — the way back from a drag that went wrong.
            onResize(0);
            onResizeEnd?.();
          }}
          className="absolute right-0 top-0 h-full w-2 cursor-col-resize select-none touch-none hover:bg-surface-strong focus:bg-fg-faint focus:outline-none"
        />
      )}

      {open && typeof document !== "undefined"
        ? createPortal(panel, document.body)
        : null}
    </th>
  );
}
