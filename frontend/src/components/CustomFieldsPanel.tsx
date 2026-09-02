"use client";

/**
 * The custom fields (labels) an organization has defined for credit cases, and this
 * case's value for each of them.
 *
 * A "label" is a field DEFINITION the organization creates once on `/labels` ("sucursal");
 * the value shown here is what THIS case holds for it ("MTY Norte"). The backend folds
 * every value back into `CreditCase.custom_fields` as a plain `{ name: value }` map, so
 * that map — not anything stored in this component — is the single source of truth for
 * what is saved. After every write this panel asks its parent to re-read the case and
 * then drops its own draft text, which is why you will not find a `savedValues` state
 * here: two copies of the same fact would eventually disagree.
 *
 * The non-obvious part: defining a new field does NOT backfill the cases that already
 * exist. A field listed here with no value is simply unset — nobody has filled it in yet
 * — and it reads as "—" on the dashboard rather than as an error or a missing record.
 */
import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  LABEL_VALUE_MAX_LENGTH,
  clearLabelValue,
  customFieldValue,
  listCreditCaseLabels,
  listExistingValues,
  setLabelValue,
} from "@/lib/labels";
import { useTransientMessage } from "@/lib/useTransientMessage";
import type { CreditCase, Label } from "@/lib/types";

export function CustomFieldsPanel(props: {
  creditCase: CreditCase;
  /**
   * Asks the page to re-read the case. Awaited before the row's draft is dropped, so the
   * input never flickers back to the old value between the save landing and the fresh
   * `custom_fields` arriving.
   */
  onChanged: () => void | Promise<void>;
}) {
  const { creditCase, onChanged } = props;

  // null while the field definitions are still being fetched — an empty array genuinely
  // means "this organization has defined no fields", which is a different thing to say.
  const [labels, setLabels] = useState<Label[] | null>(null);

  // Text the user has typed, keyed by label id. Only labels the user has actually edited
  // appear here; every other input reads straight from `custom_fields`. Clearing a key
  // hands that input back to the server's value.
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  // Values already used for each field elsewhere in the organization, for the datalist.
  const [suggestions, setSuggestions] = useState<Record<number, string[]>>({});

  // Which field is being written, so only its row spins and no second write can race the
  // parent's re-read of the case.
  const [savingLabelId, setSavingLabelId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { message: saved, show: showSaved, clear: clearSaved } = useTransientMessage();

  /**
   * The values already recorded for one field, fetched separately from the field itself.
   *
   * Re-fetched after a write as well as on load: a value the user has just invented
   * should be offered to the next case straight away.
   */
  const loadSuggestions = useCallback(async (label: Label) => {
    try {
      const values = await listExistingValues(label);
      setSuggestions((prev) => ({ ...prev, [label.id]: values }));
    } catch {
      // Suggestions are a convenience. Failing to load them must not stop the user
      // typing a value by hand, so this failure is deliberately swallowed.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const defined = await listCreditCaseLabels();
        if (cancelled) return;
        setLabels(defined);
        // Fetched in parallel rather than one at a time: an organization has a handful of
        // custom fields, and doing them in series would leave the datalists empty for as
        // long as it takes every request to finish in turn.
        await Promise.all(defined.map((label) => loadSuggestions(label)));
      } catch (err) {
        if (cancelled) return;
        setLabels([]);
        setError(err instanceof ApiError ? err.message : "Failed to load custom fields");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [loadSuggestions]);

  /** What this case currently holds for a field, or null when it was never set. */
  function savedValue(label: Label): string | null {
    return customFieldValue(creditCase.custom_fields, label.name);
  }

  /** What the input shows: the user's unsaved text if they typed, else the saved value. */
  function inputValue(label: Label): string {
    return drafts[label.id] ?? savedValue(label) ?? "";
  }

  function setDraft(label: Label, value: string) {
    setDrafts((prev) => ({ ...prev, [label.id]: value }));
  }

  /** Hand a field's input back to whatever the server now says it holds. */
  function dropDraft(label: Label) {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[label.id];
      return next;
    });
  }

  /**
   * Write one field, then let the page re-read the case.
   *
   * An empty box means "no value", which is a delete rather than a save of "" — the
   * backend would otherwise keep a row holding an empty string, and that row would then
   * show up as a filterable option on the dashboard.
   */
  async function handleSave(label: Label) {
    const value = inputValue(label).trim();
    setSavingLabelId(label.id);
    setError(null);
    clearSaved();
    try {
      if (value === "") {
        await clearLabelValue({ label, objectId: creditCase.id });
      } else {
        await setLabelValue({ label, objectId: creditCase.id, value });
      }
      await onChanged();
      dropDraft(label);
      void loadSuggestions(label);
      showSaved("Saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save custom field");
    } finally {
      setSavingLabelId(null);
    }
  }

  /** Remove this case's value for a field, leaving the field itself defined. */
  async function handleClear(label: Label) {
    setSavingLabelId(label.id);
    setError(null);
    clearSaved();
    try {
      await clearLabelValue({ label, objectId: creditCase.id });
      await onChanged();
      dropDraft(label);
      showSaved("Cleared.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to clear custom field");
    } finally {
      setSavingLabelId(null);
    }
  }

  const busy = savingLabelId !== null;

  return (
    <section className="rounded-lg border bg-surface p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Custom fields</h2>
          <p className="mt-2 text-sm text-fg-muted">
            Your organization&apos;s own fields for credit cases. A field with no value
            here has simply not been filled in for this case — adding a field never fills
            it in on cases that already exist.
          </p>
        </div>
        {saved && (
          // `aria-live` so the confirmation is announced rather than only appearing.
          <span
            aria-live="polite"
            className="shrink-0 rounded-md border border-success-line bg-success-surface px-3 py-2 text-sm text-success"
          >
            {saved}
          </span>
        )}
      </div>

      {error ? (
        <div className="mt-4 rounded-md border border-danger-line bg-danger-surface p-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {labels === null && (
        <p className="mt-4 text-sm text-fg-subtle">Loading custom fields…</p>
      )}

      {labels !== null && labels.length === 0 && (
        <div className="mt-4 rounded-md border border-dashed p-4 text-sm text-fg-muted">
          Your organization has not defined any custom fields yet.{" "}
          <Link href="/labels" className="underline">
            Add a custom field
          </Link>
          .
        </div>
      )}

      {labels !== null && labels.length > 0 && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {labels.map((label) => {
            const current = savedValue(label);
            const value = inputValue(label);
            const inputId = `custom-field-${label.id}`;
            const listId = `custom-field-options-${label.id}`;
            const options = suggestions[label.id] ?? [];
            const rowSaving = savingLabelId === label.id;
            // Nothing to write when the box already matches what the server holds.
            const dirty = value.trim() !== (current ?? "");

            return (
              <div key={label.id} className="rounded-md border bg-surface-subtle p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor={inputId} className="text-sm font-medium">
                    {label.name}
                  </label>
                  <span className="text-xs text-fg-subtle">Current: {current ?? "—"}</span>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <input
                    id={inputId}
                    type="text"
                    value={value}
                    list={listId}
                    maxLength={LABEL_VALUE_MAX_LENGTH}
                    disabled={busy}
                    onChange={(e) => setDraft(label, e.target.value)}
                    className="min-w-0 flex-1 rounded-md border bg-surface px-3 py-2 text-sm disabled:opacity-60"
                  />
                  {/* A native `<datalist>` rather than a combobox widget: it needs no
                      dependency (the project ships zero UI libraries), and a browser that
                      ignores it still leaves a perfectly usable text input. Offering the
                      values already in use is the point — without it a user types "MTY
                      norte" next to an existing "MTY Norte", and the dashboard then
                      filters them as two unrelated values. */}
                  <datalist id={listId}>
                    {options.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                  <button
                    type="button"
                    disabled={busy || !dirty}
                    onClick={() => void handleSave(label)}
                    className="shrink-0 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover disabled:opacity-60"
                  >
                    {rowSaving ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    disabled={busy || (current === null && value.trim() === "")}
                    onClick={() => void handleClear(label)}
                    aria-label={`Clear ${label.name}`}
                    className="shrink-0 rounded-md border px-3 py-2 text-sm font-medium hover:bg-surface-subtle disabled:opacity-60"
                  >
                    Clear
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
