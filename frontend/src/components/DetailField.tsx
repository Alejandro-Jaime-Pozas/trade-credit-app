"use client";

/**
 * One field+value pair in the Details section of a credit case.
 *
 * Every field in that section renders through here, whether or not it can be edited, so
 * they all look the same. That is the point: the section used to mix read-only tiles
 * (Customer, Days open) with form controls in a different shape, and custom fields lived
 * in a separate panel further down the page — three visual languages for the same idea,
 * "here is a fact about this case".
 *
 * The card is also the unit the user drags. The drag handle is a separate grip rather
 * than the whole card, because a card containing a text input has to stay selectable.
 */
import React, { useState } from "react";
import { InfoTip } from "./InfoTip";

/** The drag payload's MIME type. Namespaced so nothing else on the page claims it. */
export const DETAIL_FIELD_DRAG_TYPE = "application/x-tcapp-detail-field";

export function DetailField(props: {
  /** Stable id, used for the saved order. */
  id: string;
  label: string;
  /** Explanation shown behind a hover/focus info icon, for anything that needs one. */
  hint?: string;
  /** Marks a field the organization defined itself, with a blue "custom field" icon. */
  custom?: boolean;
  /** Highlights the card — used when a verdict is overdue. */
  tone?: "default" | "danger";
  /** Called with the id of the field dropped onto this one. */
  onReorder?: (draggedId: string) => void;
  /** True while some field is mid-drag, so every card can advertise it takes drops. */
  dragging?: boolean;
  onDragStateChange?: (dragging: boolean) => void;
  children: React.ReactNode;
}) {
  const {
    id,
    label,
    hint,
    custom = false,
    tone = "default",
    onReorder,
    dragging = false,
    onDragStateChange,
    children,
  } = props;

  const [dropTarget, setDropTarget] = useState(false);
  const draggable = Boolean(onReorder);

  return (
    <div
      className={[
        "rounded-md border p-3 text-sm transition-colors",
        tone === "danger" ? "border-danger-line bg-danger-surface" : "bg-surface-subtle",
        dropTarget ? "border-accent" : "",
        dragging && !dropTarget ? "border-dashed" : "",
      ].join(" ")}
      onDragOver={
        draggable
          ? (e) => {
              // Both are required: without preventDefault the browser refuses the drop,
              // and the effect is what turns the cursor into a move arrow.
              if (!e.dataTransfer.types.includes(DETAIL_FIELD_DRAG_TYPE)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDropTarget(true);
            }
          : undefined
      }
      onDragLeave={draggable ? () => setDropTarget(false) : undefined}
      onDrop={
        draggable
          ? (e) => {
              e.preventDefault();
              setDropTarget(false);
              const draggedId = e.dataTransfer.getData(DETAIL_FIELD_DRAG_TYPE);
              if (draggedId) onReorder?.(draggedId);
            }
          : undefined
      }
    >
      <div className="flex items-center gap-1.5">
        <span
          className={[
            "text-xs uppercase tracking-wide",
            tone === "danger" ? "text-danger" : "text-fg-muted",
          ].join(" ")}
        >
          {label}
        </span>

        {custom && <InfoTip tone="custom" text="Custom field" />}
        {hint && <InfoTip text={hint} />}

        {draggable && (
          <span
            draggable
            role="button"
            aria-label={`Move ${label}`}
            title={`Drag to move ${label}`}
            onDragStart={(e) => {
              e.dataTransfer.setData(DETAIL_FIELD_DRAG_TYPE, id);
              e.dataTransfer.effectAllowed = "move";
              onDragStateChange?.(true);
            }}
            onDragEnd={() => onDragStateChange?.(false)}
            className="ml-auto cursor-grab select-none px-1 text-fg-faint hover:text-fg-secondary active:cursor-grabbing"
          >
            <span aria-hidden="true">⠿</span>
          </span>
        )}
      </div>

      <div className="mt-1">{children}</div>
    </div>
  );
}

/**
 * A field whose value cannot be edited here.
 *
 * Wrapped in a transparent border with the same padding as a form control, so a
 * read-only value lines up with the inputs beside it instead of sitting a few pixels
 * higher — which is what made the old section read as two different kinds of thing.
 */
export function DetailValue(props: {
  children: React.ReactNode;
  tone?: "default" | "danger";
}) {
  const { children, tone = "default" } = props;
  return (
    <div
      className={[
        "rounded-md border border-transparent px-3 py-2 font-medium",
        tone === "danger" ? "text-danger" : "",
      ].join(" ")}
    >
      {children}
    </div>
  );
}
