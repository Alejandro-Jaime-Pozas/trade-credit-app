"use client";

/**
 * Edit the organization's default required documents.
 *
 * Changing this list does NOT automatically change credit cases that already exist.
 * Each case holds its own copy of what it requires, so that a case already under review
 * keeps reporting what it was actually judged against. Before saving, this page asks the
 * backend which open cases the new list would change and offers to update them — or to
 * leave them alone.
 *
 * BEFORE, not after, and that ordering is the point. This page used to save, then ask,
 * then offer to undo — so "Cancel" was itself a write, and a user who closed the tab
 * mid-prompt was left with a default they had never agreed to. Now the save happens only
 * once the user has chosen, and Cancel sends nothing at all.
 *
 * Cases already submitted for approval are never offered: their requirement list is the
 * evidence the reviewer worked from.
 */
import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import {
  FileTypeChooser,
  type FileTypeChooserSelection,
} from "@/components/FileTypeChooser";
import { ImpactWarning } from "@/components/ImpactWarning";
import { ApiError, logError } from "@/lib/api";
import {
  applyTemplateToCases,
  createDefaultTemplate,
  getDefaultTemplate,
  listFileTypes,
  previewTemplateImpact,
  templateFileTypeIds,
  updateTemplateItems,
  type TemplateImpactEntry,
} from "@/lib/fileTypes";
import { useTransientMessage } from "@/lib/useTransientMessage";
import type { FileType, RequirementTemplate } from "@/lib/types";

export default function RequirementsPage() {
  const [fileTypes, setFileTypes] = useState<FileType[] | null>(null);
  const [template, setTemplate] = useState<RequirementTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Confirmation that the default was written. Transient — it is only meaningful for a
  // few seconds after the click that caused it.
  const { message: saved, show: showSaved, clear: clearSaved } = useTransientMessage();

  // Populated only when the list the user just picked would change existing open cases.
  const [impact, setImpact] = useState<TemplateImpactEntry[] | null>(null);
  const [applying, setApplying] = useState(false);
  // The list the user picked, held while they answer the prompt. Nothing has been
  // written yet — this is what gets saved if (and only if) they say yes.
  const [pendingFileTypeIds, setPendingFileTypeIds] = useState<number[] | null>(null);

  /**
   * Bumping this remounts the chooser, resetting its ticked boxes to the saved template.
   *
   * Deliberately NOT bumped on Cancel: someone who backs out is usually mid-thought about
   * which documents they want, so their selection stays on screen to keep adjusting.
   *
   * Leaving the page needs no bump at all — the page unmounts, and coming back re-reads
   * the template, so an unsaved selection never survives navigation.
   */
  const [chooserResetKey, setChooserResetKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [catalog, defaultTemplate] = await Promise.all([
          listFileTypes(),
          getDefaultTemplate(),
        ]);
        if (cancelled) return;
        setFileTypes(catalog);
        setTemplate(defaultTemplate);
      } catch (err) {
        if (cancelled) return;
        logError("requirements:load", err);
        setError(
          err instanceof ApiError ? err.message : "Failed to load requirements",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Write the chosen list, and optionally push it onto the open cases listed in `impact`.
   *
   * The single place this page writes anything. Both prompt answers land here, and so
   * does the no-prompt path, so there is exactly one description of what saving means.
   */
  async function commit(fileTypeIds: number[], creditCaseIds: number[]) {
    const updated = template
      ? await updateTemplateItems({ template, fileTypeIds })
      : await createDefaultTemplate({ fileTypeIds });
    setTemplate(updated);

    if (creditCaseIds.length > 0) {
      await applyTemplateToCases({ template: updated, creditCaseIds });
    }

    setImpact(null);
    setPendingFileTypeIds(null);
    setChooserResetKey((k) => k + 1);
  }

  /**
   * Ask first, save second.
   *
   * Nothing is written here. If the new list would change open cases, the selection is
   * held in `pendingFileTypeIds` and the prompt decides its fate; otherwise there is
   * nothing to ask about and it is saved immediately.
   *
   * A template that doesn't exist yet skips the preview: no case can have been seeded
   * from a template that was never there, so there is nothing it could disturb.
   */
  async function handleSave(selection: FileTypeChooserSelection) {
    // No Default button is rendered on this page — this list IS the default — so the
    // chooser can only report explicitly picked file types.
    if (selection.mode !== "fileTypes") return;

    setSaving(true);
    setError(null);
    clearSaved();
    try {
      const entries = template
        ? await previewTemplateImpact({
            template,
            fileTypeIds: selection.fileTypeIds,
          })
        : [];

      if (entries.length > 0) {
        setPendingFileTypeIds(selection.fileTypeIds);
        setImpact(entries);
        return;
      }

      await commit(selection.fileTypeIds, []);
      showSaved("Default requirements saved.");
    } catch (err) {
      logError("requirements:save", err);
      setError(err instanceof ApiError ? err.message : "Failed to save requirements");
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyToOpenCases() {
    if (!impact || pendingFileTypeIds === null) return;
    setApplying(true);
    setError(null);
    try {
      await commit(
        pendingFileTypeIds,
        impact.map((entry) => entry.credit_case_id),
      );
      showSaved("Default requirements saved and applied to open credit cases.");
    } catch (err) {
      logError("requirements:apply", err);
      setError(err instanceof ApiError ? err.message : "Failed to update credit cases");
    } finally {
      setApplying(false);
    }
  }

  /** Save the new default, but leave open cases on the list they already had. */
  async function handleKeepOpenCases() {
    if (pendingFileTypeIds === null) return;
    setApplying(true);
    setError(null);
    try {
      await commit(pendingFileTypeIds, []);
      showSaved("Default requirements saved. Open credit cases were left as they are.");
    } catch (err) {
      logError("requirements:keep", err);
      setError(err instanceof ApiError ? err.message : "Failed to save requirements");
    } finally {
      setApplying(false);
    }
  }

  /**
   * Back out. Sends nothing.
   *
   * Nothing was written to undo — that is the whole reason the preview happens before
   * the save. The user's ticked boxes are deliberately left on screen (see
   * `chooserResetKey`) so they can adjust rather than start over.
   */
  function handleCancelSave() {
    setImpact(null);
    setPendingFileTypeIds(null);
  }

  const selectedIds = templateFileTypeIds(template);

  return (
    <AppShell>
      <RequireAuth>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Required documents
          </h1>
          <p className="mt-2 text-sm text-fg-muted">
            The documents every new credit case asks for by default. Existing cases keep
            what they were created with unless you choose to update them.
          </p>
        </div>

        {error && (
          <div className="mt-6 rounded-md border border-danger-line bg-danger-surface p-3 text-sm text-danger">
            {error}
          </div>
        )}

        {saved && !impact && (
          <div className="mt-6 rounded-md border border-success-line bg-success-surface p-3 text-sm text-success">
            {saved}
          </div>
        )}

        <section className="mt-6 rounded-lg border bg-surface p-6">
          {loading && <p className="text-sm text-fg-muted">Loading…</p>}

          {!loading && fileTypes && (
            <>
              {!template && (
                <p className="mb-4 text-sm text-fg-muted">
                  You haven&apos;t set your required documents yet. Pick them below.
                </p>
              )}
              <FileTypeChooser
                // Remounts only when the page decides the chooser should resync with
                // what is saved — see chooserResetKey.
                key={chooserResetKey}
                fileTypes={fileTypes}
                initialSelectedIds={selectedIds}
                submitLabel="Save default requirements"
                submitting={saving}
                onSubmit={(selection) => void handleSave(selection)}
              />
            </>
          )}
        </section>

        {impact && (
          <ImpactWarning
            entries={impact}
            busy={applying}
            onApply={() => void handleApplyToOpenCases()}
            onKeep={() => void handleKeepOpenCases()}
            onCancel={handleCancelSave}
          />
        )}
      </RequireAuth>
    </AppShell>
  );
}
