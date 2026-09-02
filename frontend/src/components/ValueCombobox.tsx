"use client";

/**
 * A text box that offers the values already in use, without insisting on one of them.
 *
 * Custom field values used to be a plain input with a native `<datalist>`. A datalist is
 * invisible until you start typing, so someone whose organization already records
 * "MTY Norte" had no way to discover that from the box — they retyped it, sometimes as
 * "MTY norte", and the dashboard then filtered the two as unrelated values. That is the
 * exact failure this component exists to stop.
 *
 * It stays a free-text input rather than a `<select>` because the first case to use a new
 * value has to be able to type it. Search narrows the list, and text matching nothing gets
 * an explicit `+ Create "…"` row at the foot of the list.
 *
 * That row is the difference between "you may type a new value" being TRUE and it being
 * VISIBLE. Without it a list of existing values reads as the only permitted answers, and
 * users went looking for somewhere else to define one — which is not a thing that exists,
 * since values are created simply by using them.
 *
 * The panel renders through a portal positioned `fixed`, for the same reason
 * `FileTypeSelect` and `TableColumnHeader` do: a scrolling or clipping ancestor would
 * otherwise slice it off.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Minimum gap kept between the panel and the edges of the viewport. */
const VIEWPORT_MARGIN = 8;
/** Room the option list may take below the input before it is capped. */
const MAX_LIST_HEIGHT = 240;

type PanelPosition = { top: number; left: number; width: number; maxListHeight: number };

/** Anchored to the input's full width, then clamped into the viewport. */
function computePanelPosition(anchor: HTMLElement): PanelPosition {
  const rect = anchor.getBoundingClientRect();
  return {
    top: rect.bottom + 4,
    left: Math.max(VIEWPORT_MARGIN, rect.left),
    width: rect.width,
    maxListHeight: Math.max(
      120,
      Math.min(
        MAX_LIST_HEIGHT,
        window.innerHeight - rect.bottom - VIEWPORT_MARGIN * 3,
      ),
    ),
  };
}

export function ValueCombobox(props: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /**
   * Values already recorded elsewhere. An empty list still gets a dropdown as soon as the
   * user types — that is where `+ Create "…"` lives, and a field nobody has filled in yet
   * is exactly where "can I just type one?" needs answering.
   */
  options: string[];
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  /** Names the control for screen readers when there is no visible <label>. */
  ariaLabel?: string;
  className?: string;
}) {
  const {
    id,
    value,
    onChange,
    options,
    disabled = false,
    placeholder,
    maxLength,
    ariaLabel,
    className = "",
  } = props;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listboxId = `${id ?? "value-combobox"}-listbox`;

  /** Options matching what has been typed so far. Empty is a normal, useful answer. */
  const matching = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => option.toLowerCase().includes(query));
  }, [options, value]);

  /**
   * Whether to offer `+ Create "…"` for what the user has typed.
   *
   * Not offered for text that already IS one of the values — "create MTY Norte" next to
   * the MTY Norte the organization already uses invites a duplicate, which is the exact
   * mess this control exists to prevent. The comparison is case-insensitive for the same
   * reason: "mty norte" must read as the value that exists, not as a new one.
   */
  const trimmed = value.trim();
  const canCreate =
    trimmed !== "" &&
    !options.some((option) => option.toLowerCase() === trimmed.toLowerCase());

  /**
   * The rows the arrow keys walk, in render order.
   *
   * The create row is one of them rather than a special case bolted on afterwards, so
   * Enter picks whatever is highlighted without the keyboard path needing to know which
   * kind of row it landed on.
   */
  const rows = useMemo(
    () => [
      ...matching.map((option) => ({ kind: "option" as const, value: option })),
      ...(canCreate ? [{ kind: "create" as const, value: trimmed }] : []),
    ],
    [matching, canCreate, trimmed],
  );

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    setPosition(null);
    if (returnFocus) inputRef.current?.focus();
  }, []);

  function openPanel() {
    if (disabled || rows.length === 0) return;
    const anchor = wrapperRef.current;
    // Measured here rather than in an effect so the panel is placed on its first paint
    // (and so no setState happens inside an effect body).
    if (anchor) setPosition(computePanelPosition(anchor));
    setActiveIndex(0);
    setOpen(true);
  }

  /**
   * The panel is a portal, so it is not a descendant of this component and the usual
   * "did focus leave the wrapper?" blur check cannot see it. Watch the document instead,
   * and keep the fixed position in step with scrolling.
   */
  useEffect(() => {
    if (!open) return;

    const isInside = (target: EventTarget | null) =>
      target instanceof Node &&
      (wrapperRef.current?.contains(target) === true ||
        panelRef.current?.contains(target) === true);

    const handlePointerDown = (e: MouseEvent) => {
      if (!isInside(e.target)) close(false);
    };
    const handleFocusIn = (e: FocusEvent) => {
      if (!isInside(e.target)) close(false);
    };
    // Watched on the document rather than only on the input: the caret button opens the
    // panel too, and Escape has to shut it from there as well.
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    const reposition = () => {
      const anchor = wrapperRef.current;
      if (anchor) setPosition(computePanelPosition(anchor));
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, close]);

  function commit(option: string) {
    onChange(option);
    setOpen(false);
    setPosition(null);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      close(false);
      return;
    }
    if (e.key === "ArrowDown" && !open) {
      e.preventDefault();
      openPanel();
      return;
    }
    if (!open || rows.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % rows.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + rows.length) % rows.length);
        break;
      case "Enter": {
        e.preventDefault();
        const row = rows[activeIndex];
        // Committing the create row keeps the text the user already typed — the value
        // exists the moment this case is saved with it, so there is nothing else to do.
        if (row) commit(row.value);
        break;
      }
    }
  }

  return (
    <div ref={wrapperRef} className={`relative flex items-stretch ${className}`}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-label={ariaLabel}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        onChange={(e) => {
          onChange(e.target.value);
          // Reset the highlight here rather than in an effect —
          // react-hooks/set-state-in-effect rejects setState inside useEffect.
          setActiveIndex(0);
          if (!open) openPanel();
        }}
        onKeyDown={handleKeyDown}
        className={[
          "min-w-0 flex-1 rounded-md border bg-surface px-3 py-2 text-sm disabled:opacity-60",
          options.length > 0 ? "rounded-r-none border-r-0" : "",
        ].join(" ")}
      />

      {/* Only rendered when there is something to drop down. A field nobody has ever
          filled in has no values to offer, and a caret promising an empty list is worse
          than no caret at all. */}
      {options.length > 0 && (
        <button
          type="button"
          disabled={disabled}
          tabIndex={-1}
          aria-label="Show existing values"
          aria-expanded={open}
          onClick={() => (open ? close(true) : openPanel())}
          className="shrink-0 rounded-md rounded-l-none border border-l-0 bg-surface px-2 text-sm text-fg-subtle hover:bg-surface-subtle disabled:opacity-60"
        >
          <span aria-hidden="true">▾</span>
        </button>
      )}

      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="z-30 overflow-hidden rounded-md border bg-surface shadow-lg"
            style={{
              position: "fixed",
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              width: position?.width ?? 240,
            }}
          >
            {/* The LIST scrolls, not the panel: the hint below has to stay visible, and
                it is the part that explains what "Create" actually does. */}
            <div
              id={listboxId}
              role="listbox"
              aria-label="Existing values"
              className="overflow-y-auto py-1"
              style={{ maxHeight: position?.maxListHeight ?? MAX_LIST_HEIGHT }}
            >
              {rows.map((row, index) =>
                row.kind === "option" ? (
                  <button
                    key={`option:${row.value}`}
                    type="button"
                    role="option"
                    aria-selected={row.value === value}
                    onMouseEnter={() => setActiveIndex(index)}
                    // Keeps focus in the input so the document focus watcher above
                    // doesn't close the panel before the click lands.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => commit(row.value)}
                    className={[
                      "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm",
                      index === activeIndex
                        ? "bg-surface-muted"
                        : "hover:bg-surface-subtle",
                    ].join(" ")}
                  >
                    <span className="truncate">{row.value}</span>
                    {row.value === value && (
                      <span aria-hidden="true" className="text-fg-subtle">
                        ✓
                      </span>
                    )}
                  </button>
                ) : (
                  <React.Fragment key="create">
                    {matching.length > 0 && <div className="border-t" />}
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => commit(row.value)}
                      className={[
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                        matching.length > 0 ? "text-fg-muted" : "",
                        index === activeIndex
                          ? "bg-surface-muted"
                          : "hover:bg-surface-subtle",
                      ].join(" ")}
                    >
                      <span className="truncate">
                        + Create &ldquo;{row.value}&rdquo;
                      </span>
                    </button>
                  </React.Fragment>
                ),
              )}

            </div>

            {/* Says where the new value goes. Without it "Create" reads as a promise
                something was written, and the user leaves the page having lost it. */}
            {canCreate && (
              <div className="border-t px-3 py-1.5 text-xs text-fg-subtle">
                Added to this field when you save the case.
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
