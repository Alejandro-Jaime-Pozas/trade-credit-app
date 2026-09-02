"use client";

/**
 * Manage the organization's own credit case fields ("custom fields").
 *
 * A field created here behaves like a built-in credit case field — it becomes a column
 * on the dashboard that can be filtered and sorted — but it is NOT backfilled onto the
 * cases that already exist. Creating "sucursal" does not go and guess a sucursal for the
 * 200 cases already in the system: each of those simply has no value for it, and reads
 * as "—" everywhere until someone opens that case and fills it in. The field is the
 * definition; the values are entered case by case, whenever the user gets to them.
 *
 * Deleting works the other way round and is the destructive direction: the values are
 * owned by the field, so removing the field removes every value recorded under it, on
 * every credit case, at once. That is why the confirmation here goes and counts what is
 * actually recorded before asking — an unquantified "are you sure?" tells the user
 * nothing about what they are about to lose.
 */
import React, { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { RequireAuth } from "@/components/RequireAuth";
import { ApiError, logError } from "@/lib/api";
import {
  createLabel,
  deleteLabel,
  LABEL_NAME_MAX_LENGTH,
  listCreditCaseLabels,
  listExistingValues,
  renameLabel,
  sortLabels,
  validateLabelName,
} from "@/lib/labels";
import { useTransientMessage } from "@/lib/useTransientMessage";
import type { Label } from "@/lib/types";

/**
 * What the confirmation knows about the values it is about to destroy.
 *
 * `null` while the count is still being fetched and `"unknown"` if that fetch failed —
 * a failed count must not silently read as "nothing recorded", which would talk the user
 * into a delete they would not otherwise agree to.
 */
type DeleteValues = string[] | "unknown" | null;

/** How many example values the confirmation names before trailing off. */
const VALUE_PREVIEW_LIMIT = 5;

export default function LabelsPage() {
  const [labels, setLabels] = useState<Label[] | null>(null);
  const [loading, setLoading] = useState(true);
  // Failures that aren't tied to one of the forms below (loading the list, deleting).
  const [error, setError] = useState<string | null>(null);
  const { message: saved, show: showSaved, clear: clearSaved } = useTransientMessage();

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // The label being renamed, if any, and the name typed for it. Held as an id rather
  // than the label object so the row keeps editing correctly after the list is re-sorted.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [labelToDelete, setLabelToDelete] = useState<Label | null>(null);
  const [deleteValues, setDeleteValues] = useState<DeleteValues>(null);
  const [deleting, setDeleting] = useState(false);
  // Which label the in-flight value lookup belongs to, so a slow response for a field
  // the user already dismissed can't land on the next confirmation.
  const valueLookupFor = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const rows = await listCreditCaseLabels();
        if (cancelled) return;
        setLabels(rows);
      } catch (err) {
        if (cancelled) return;
        logError("labels:load", err);
        setError(err instanceof ApiError ? err.message : "Failed to load custom fields");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    // Checked here as well as by the backend so a duplicate name costs no request and
    // comes back as a sentence rather than a constraint violation.
    const problem = validateLabelName(newName, labels ?? []);
    if (problem) {
      setCreateError(problem);
      return;
    }

    setCreating(true);
    setCreateError(null);
    clearSaved();
    try {
      const created = await createLabel(newName);
      setLabels(sortLabels([...(labels ?? []), created]));
      setNewName("");
      showSaved(`"${created.name}" added. Existing credit cases have no value for it yet.`);
    } catch (err) {
      logError("labels:create", err);
      setCreateError(err instanceof ApiError ? err.message : "Failed to add the field");
    } finally {
      setCreating(false);
    }
  }

  function startRename(label: Label) {
    setEditingId(label.id);
    setEditingName(label.name);
    setRenameError(null);
  }

  function cancelRename() {
    setEditingId(null);
    setEditingName("");
    setRenameError(null);
  }

  async function handleRename(label: Label) {
    // `ignoreId` keeps a label from clashing with itself, so a rename that only changes
    // capitalisation ("sucursal" -> "Sucursal") is still allowed.
    const problem = validateLabelName(editingName, labels ?? [], { ignoreId: label.id });
    if (problem) {
      setRenameError(problem);
      return;
    }

    setRenaming(true);
    setRenameError(null);
    clearSaved();
    try {
      const updated = await renameLabel(label, editingName);
      setLabels(
        sortLabels((labels ?? []).map((l) => (l.id === updated.id ? updated : l))),
      );
      cancelRename();
      showSaved(`Renamed to "${updated.name}".`);
    } catch (err) {
      logError("labels:rename", err);
      setRenameError(err instanceof ApiError ? err.message : "Failed to rename the field");
    } finally {
      setRenaming(false);
    }
  }

  /**
   * Opens the delete confirmation and, in parallel, looks up what is recorded for the
   * field so the dialog can say what the delete actually costs.
   *
   * The lookup runs from this click handler rather than an effect keyed on
   * `labelToDelete`: state set from an effect is what `react-hooks/set-state-in-effect`
   * exists to stop, and the click is the only thing that ever starts this anyway.
   */
  function requestDelete(label: Label) {
    setLabelToDelete(label);
    setDeleteValues(null);
    setError(null);
    valueLookupFor.current = label.id;
    void (async () => {
      try {
        const values = await listExistingValues(label);
        if (valueLookupFor.current === label.id) setDeleteValues(values);
      } catch (err) {
        logError("labels:existing-values", err);
        if (valueLookupFor.current === label.id) setDeleteValues("unknown");
      }
    })();
  }

  /** Close the confirmation without deleting, abandoning any in-flight value lookup. */
  function cancelDelete() {
    valueLookupFor.current = null;
    setLabelToDelete(null);
    setDeleteValues(null);
  }

  async function handleDelete(label: Label) {
    setDeleting(true);
    setError(null);
    clearSaved();
    try {
      await deleteLabel(label);
      setLabels((labels ?? []).filter((l) => l.id !== label.id));
      if (editingId === label.id) cancelRename();
      cancelDelete();
      showSaved(`"${label.name}" and its values were deleted.`);
    } catch (err) {
      logError("labels:delete", err);
      setError(err instanceof ApiError ? err.message : "Failed to delete the field");
      cancelDelete();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppShell>
      <RequireAuth>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Custom fields</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Your own fields on credit cases. Each one becomes a column you can filter and
            sort by. A new field starts empty everywhere: credit cases that already exist
            show &ldquo;—&rdquo; for it until someone fills it in.
          </p>
        </div>

        {error && (
          <div className="mt-6 rounded-md border border-danger-line bg-danger-surface p-3 text-sm text-danger">
            {error}
          </div>
        )}

        {saved && (
          <div className="mt-6 rounded-md border border-success-line bg-success-surface p-3 text-sm text-success">
            {saved}
          </div>
        )}

        <section className="mt-6 rounded-lg border bg-surface p-6">
          <h2 className="text-base font-semibold">Add a field</h2>
          <form className="mt-3 flex flex-wrap items-start gap-2" onSubmit={(e) => void handleCreate(e)}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={LABEL_NAME_MAX_LENGTH}
              placeholder="e.g. sucursal"
              aria-label="New field name"
              className="w-64 rounded-md border px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={creating}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover disabled:opacity-60"
            >
              {creating ? "Adding…" : "Add field"}
            </button>
          </form>
          {createError && <p className="mt-2 text-sm text-danger">{createError}</p>}
        </section>

        <section className="mt-6 rounded-lg border bg-surface p-6">
          <h2 className="text-base font-semibold">Your fields</h2>

          {loading && <p className="mt-3 text-sm text-fg-muted">Loading…</p>}

          {!loading && labels && labels.length === 0 && (
            <p className="mt-3 text-sm text-fg-muted">
              No custom fields yet. Add one above to start tracking something the built-in
              credit case fields don&apos;t cover.
            </p>
          )}

          {!loading && labels && labels.length > 0 && (
            <ul className="mt-3 divide-y rounded-md border">
              {labels.map((label) => (
                <li key={label.id} className="px-3 py-2">
                  {editingId === label.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        maxLength={LABEL_NAME_MAX_LENGTH}
                        aria-label={`Rename ${label.name}`}
                        autoFocus
                        className="w-64 rounded-md border px-3 py-1.5 text-sm"
                      />
                      <button
                        type="button"
                        disabled={renaming}
                        onClick={() => void handleRename(label)}
                        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:bg-primary-hover disabled:opacity-60"
                      >
                        {renaming ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        disabled={renaming}
                        onClick={cancelRename}
                        className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-surface-subtle disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-fg">{label.name}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startRename(label)}
                          aria-label={`Rename ${label.name}`}
                          className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-surface-subtle"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => requestDelete(label)}
                          aria-label={`Delete ${label.name}`}
                          className="rounded-md border border-danger-line bg-surface px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger-surface"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                  {editingId === label.id && renameError && (
                    <p className="mt-2 text-sm text-danger">{renameError}</p>
                  )}
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 text-xs text-fg-subtle">
            Renaming a field keeps every value already recorded under it. Deleting a field
            deletes those values too.
          </p>
        </section>

        <ConfirmDialog
          open={labelToDelete !== null}
          title="Delete this custom field?"
          name={labelToDelete?.name}
          description={describeDeleteImpact(deleteValues)}
          busy={deleting}
          onConfirm={() => {
            if (labelToDelete) void handleDelete(labelToDelete);
          }}
          onCancel={cancelDelete}
        />
      </RequireAuth>
    </AppShell>
  );
}

/**
 * The sentence the confirmation shows about what a delete would destroy.
 *
 * The backend reports DISTINCT values rather than a count of credit cases, so this is
 * careful to say "distinct values" — claiming "3 credit cases" when three cases share
 * one value would understate the damage.
 */
function describeDeleteImpact(values: DeleteValues): string {
  if (values === null) return "Checking what is recorded for this field…";
  if (values === "unknown") {
    return "We couldn't check what is recorded for this field. Deleting it removes its value from every credit case that has one.";
  }
  if (values.length === 0) {
    return "No credit case has a value for this field yet, so nothing else is lost.";
  }

  const preview = values.slice(0, VALUE_PREVIEW_LIMIT).join(", ");
  const rest = values.length > VALUE_PREVIEW_LIMIT ? ", …" : "";
  const plural = values.length === 1 ? "value is" : "distinct values are";
  return `${values.length} ${plural} recorded for this field across your credit cases (${preview}${rest}). Deleting the field removes it from every credit case that has one.`;
}
