"use client";

/**
 * Edit the organization's default required documents.
 *
 * Changing this list does NOT automatically change credit cases that already exist.
 * Each case holds its own copy of what it requires, so that a case already under review
 * keeps reporting what it was actually judged against. After saving, this page asks the
 * backend which open cases would change and offers to update them — or leave them alone.
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
  getTemplateImpact,
  listFileTypes,
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

  // Populated only when a save would change existing open cases.
  const [impact, setImpact] = useState<TemplateImpactEntry[] | null>(null);
  const [applying, setApplying] = useState(false);
  // What the default contained BEFORE this save, so Cancel can put it back. The save has
  // to happen first — the impact is computed server-side against the stored template —
  // so "cancel" means undo rather than don't-do.
  const [previousFileTypeIds, setPreviousFileTypeIds] = useState<number[] | null>(null);

  /**
   * Bumping this remounts the chooser, resetting its ticked boxes to the saved template.
   *
   * Deliberately NOT bumped on Cancel: someone who backs out of a save is usually mid-
   * thought about which documents they want, so their selection stays on screen to keep
   * adjusting. It is only their *saved* default that gets put back.
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

  async function handleSave(selection: FileTypeChooserSelection) {
    // No Default button is rendered on this page — this list IS the default — so the
    // chooser can only report explicitly picked file types.
    if (selection.mode !== "fileTypes") return;

    setSaving(true);
    setError(null);
    clearSaved();
    const idsBeforeSave = templateFileTypeIds(template);
    try {
      const updated = template
        ? await updateTemplateItems({
            template,
            fileTypeIds: selection.fileTypeIds,
          })
        : await createDefaultTemplate({ fileTypeIds: selection.fileTypeIds });

      setTemplate(updated);
      showSaved("Default requirements saved.");

      // Ask what this would do to open cases. Empty means everything is already in
      // sync, so there is nothing to prompt about.
      const entries = await getTemplateImpact(updated);
      if (entries.length > 0) {
        setPreviousFileTypeIds(idsBeforeSave);
        setImpact(entries);
      }
    } catch (err) {
      logError("requirements:save", err);
      setError(err instanceof ApiError ? err.message : "Failed to save requirements");
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyToOpenCases() {
    if (!template || !impact) return;
    setApplying(true);
    setError(null);
    try {
      await applyTemplateToCases({
        template,
        creditCaseIds: impact.map((entry) => entry.credit_case_id),
      });
      setImpact(null);
      setPreviousFileTypeIds(null);
      setChooserResetKey((k) => k + 1);
      showSaved("Default requirements saved and applied to open credit cases.");
    } catch (err) {
      logError("requirements:apply", err);
      setError(err instanceof ApiError ? err.message : "Failed to update credit cases");
    } finally {
      setApplying(false);
    }
  }

  /** Accept the new default, but leave open cases on the list they already had. */
  function handleKeepOpenCases() {
    setImpact(null);
    setPreviousFileTypeIds(null);
    setChooserResetKey((k) => k + 1);
    showSaved("Default requirements saved. Open credit cases were left as they are.");
  }

  /**
   * Back out entirely: put the default back to what it was before this save.
   *
   * The template had to be written before the impact could be computed, so cancelling
   * is an undo rather than a "don't do it". Without this, dismissing the dialog would
   * silently leave a default the user never agreed to.
   */
  async function handleCancelSave() {
    if (!template || previousFileTypeIds === null) {
      setImpact(null);
      return;
    }
    setApplying(true);
    setError(null);
    try {
      const reverted = await updateTemplateItems({
        template,
        fileTypeIds: previousFileTypeIds,
      });
      setTemplate(reverted);
      setImpact(null);
      setPreviousFileTypeIds(null);
      clearSaved();
    } catch (err) {
      logError("requirements:cancel", err);
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to undo the change to your default requirements",
      );
    } finally {
      setApplying(false);
    }
  }

  const selectedIds = templateFileTypeIds(template);

  return (
    <AppShell>
      <RequireAuth>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Required documents
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            The documents every new credit case asks for by default. Existing cases keep
            what they were created with unless you choose to update them.
          </p>
        </div>

        {error && (
          <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {saved && !impact && (
          <div className="mt-6 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900">
            {saved}
          </div>
        )}

        <section className="mt-6 rounded-lg border bg-white p-6">
          {loading && <p className="text-sm text-zinc-600">Loading…</p>}

          {!loading && fileTypes && (
            <>
              {!template && (
                <p className="mb-4 text-sm text-zinc-600">
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
            onKeep={handleKeepOpenCases}
            onCancel={() => void handleCancelSave()}
          />
        )}
      </RequireAuth>
    </AppShell>
  );
}
