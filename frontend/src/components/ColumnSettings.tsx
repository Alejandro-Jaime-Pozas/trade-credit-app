"use client";

/**
 * The "Columns" menu above the credit cases table: what is shown, and in what order.
 *
 * The headers themselves can be dragged, which is the fast way to rearrange them. This
 * panel is the other half of that, and not a nicety: dragging is mouse-only, so without
 * Move up / Move down here a keyboard user could not reorder the table at all. It is also
 * the only place a hidden column can be brought back — once hidden, its header is gone,
 * so there is nothing left to click.
 *
 * Rendered through a portal positioned `fixed`, like every other panel in this app, so an
 * ancestor with `overflow` can't slice it off.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const PANEL_WIDTH = 288;
const VIEWPORT_MARGIN = 8;

type PanelPosition = { top: number; left: number; maxHeight: number };

function computePanelPosition(button: HTMLElement): PanelPosition {
  const rect = button.getBoundingClientRect();
  const maxLeft = Math.max(
    VIEWPORT_MARGIN,
    window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN,
  );
  return {
    top: rect.bottom + 4,
    left: Math.min(Math.max(rect.right - PANEL_WIDTH, VIEWPORT_MARGIN), maxLeft),
    maxHeight: Math.max(160, window.innerHeight - rect.bottom - VIEWPORT_MARGIN * 4),
  };
}

export type ColumnSettingsEntry = {
  id: string;
  label: string;
  visible: boolean;
};

export function ColumnSettings(props: {
  /** Every column, in the order the table currently renders them. */
  entries: ColumnSettingsEntry[];
  onToggleVisible: (columnId: string) => void;
  onMove: (columnId: string, delta: -1 | 1) => void;
  /** Forget this user's arrangement and go back to the table's own defaults. */
  onReset: () => void;
}) {
  const { entries, onToggleVisible, onMove, onReset } = props;

  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const hiddenCount = entries.filter((e) => !e.visible).length;
  // A table with every column hidden is a table with nothing in it and no way back
  // except this menu, so the last visible column cannot be switched off.
  const visibleCount = entries.length - hiddenCount;

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    setPosition(null);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    const isInside = (target: EventTarget | null) =>
      target instanceof Node &&
      (buttonRef.current?.contains(target) === true ||
        panelRef.current?.contains(target) === true);

    const handlePointerDown = (e: MouseEvent) => {
      if (!isInside(e.target)) close(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    const reposition = () => {
      const button = buttonRef.current;
      if (button) setPosition(computePanelPosition(button));
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            close(false);
            return;
          }
          if (buttonRef.current) setPosition(computePanelPosition(buttonRef.current));
          setOpen(true);
        }}
        className="rounded-md border px-3 py-1.5 text-xs font-medium text-fg-secondary hover:bg-surface-subtle"
      >
        Columns
        {hiddenCount > 0 && (
          <span className="ml-1.5 rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-fg-secondary">
            {hiddenCount} hidden
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="z-30 overflow-y-auto rounded-md border bg-surface shadow-lg"
            style={{
              position: "fixed",
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              width: PANEL_WIDTH,
              maxHeight: position?.maxHeight ?? 320,
            }}
          >
            <div className="border-b px-3 py-2 text-xs text-fg-muted">
              Drag a column heading to reorder, or use the arrows here.
            </div>

            <ul className="py-1">
              {entries.map((entry, index) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-2 px-2 py-1.5 hover:bg-surface-subtle"
                >
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={entry.visible}
                      disabled={entry.visible && visibleCount === 1}
                      onChange={() => onToggleVisible(entry.id)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="truncate">{entry.label}</span>
                  </label>

                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => onMove(entry.id, -1)}
                    aria-label={`Move ${entry.label} left`}
                    className="rounded border px-1.5 text-xs text-fg-secondary hover:bg-surface-muted disabled:opacity-30"
                  >
                    <span aria-hidden="true">↑</span>
                  </button>
                  <button
                    type="button"
                    disabled={index === entries.length - 1}
                    onClick={() => onMove(entry.id, 1)}
                    aria-label={`Move ${entry.label} right`}
                    className="rounded border px-1.5 text-xs text-fg-secondary hover:bg-surface-muted disabled:opacity-30"
                  >
                    <span aria-hidden="true">↓</span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="border-t px-3 py-2">
              <button
                type="button"
                onClick={onReset}
                className="text-xs text-fg-muted underline hover:text-fg"
              >
                Reset to default columns
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
