"use client";

/**
 * Credit case detail (`/credit-cases/[id]`).
 *
 * View/edit a single trade credit case: status, amounts, linked customer,
 * required documents checklist, and file uploads (single or bulk).
 */
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DetailField, DetailValue } from "@/components/DetailField";
import { ImpactWarning } from "@/components/ImpactWarning";
import { ValueCombobox } from "@/components/ValueCombobox";
import { DocumentList, documentDisplayName } from "@/components/DocumentList";
import { FileTypePicker } from "@/components/FileTypePicker";
import { FileUploadField } from "@/components/FileUploadField";
import { MoneyInput } from "@/components/MoneyInput";
import { RequireAuth } from "@/components/RequireAuth";
import { StatusDot } from "@/components/StatusDot";
import { apiForm, apiJson, ApiError, drfListAll } from "@/lib/api";
import {
  CREDIT_CASE_STATUS_LABELS,
  CREDIT_CASE_VERDICT_LABELS,
  CURRENCY_OPTIONS,
  REQUESTED_TERM_DAYS_OPTIONS,
} from "@/lib/constants";
import { formatDate } from "@/lib/format";
import {
  LABEL_NAME_MAX_LENGTH,
  LABEL_VALUE_MAX_LENGTH,
  clearLabelValue,
  createLabel,
  customFieldValue,
  labelColumnId,
  listCreditCaseLabels,
  listExistingValues,
  setLabelValue,
  validateLabelName,
} from "@/lib/labels";
import { applyOrder, loadLayout, moveItem, saveLayout } from "@/lib/layoutPrefs";
import { useClassificationPolling } from "@/lib/useClassificationPolling";
import { useTransientMessage } from "@/lib/useTransientMessage";
import {
  addCreditCaseRequirement,
  applyTemplateToCases,
  createDefaultTemplate,
  fileTypeLabel,
  getDefaultTemplate,
  listCreditCaseRequirements,
  listFileTypes,
  previewTemplateImpact,
  removeCreditCaseRequirement,
  updateTemplateItems,
  type TemplateImpactEntry,
} from "@/lib/fileTypes";
import type {
  CreditCase,
  CreditCaseRequirement,
  Customer,
  FileType,
  Label,
  Organization,
  RequirementTemplate,
  UploadDocument,
  User,
} from "@/lib/types";

/** Identifies the Details section's saved field order in localStorage. */
const DETAILS_LAYOUT_ID = "creditCaseDetails";

/**
 * How long is left to reach a verdict on a case, in words.
 *
 * `days_until_verdict_due` counts DOWN and then keeps going, so once the deadline has
 * passed it is negative: -3 means the verdict is three days late, and printing it raw
 * would read as "-3 days left". Null means no deadline could be worked out (the
 * organization has not set one and neither has the case), which is shown as "—" rather
 * than as zero, because "no deadline" and "due today" are not the same answer.
 */
function verdictDueLabel(days: number | null | undefined): string {
  if (days == null) return "—";
  if (days < 0) {
    const late = Math.abs(days);
    return `${late} ${late === 1 ? "day" : "days"} late`;
  }
  // Zero is the deadline itself, not "no time left" — saying "0 days left" beside a
  // case that is still perfectly on time reads as an alarm it isn't.
  if (days === 0) return "Due today";
  return `${days} ${days === 1 ? "day" : "days"} left`;
}

export default function CreditCaseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const [creditCase, setCreditCase] = useState<CreditCase | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [uploads, setUploads] = useState<UploadDocument[] | null>(null);
  // The document catalog, used to turn file type keys into readable labels. Served by
  // the backend rather than hardcoded here, so newly added document types show up
  // with proper names instead of raw keys.
  const [fileTypes, setFileTypes] = useState<FileType[] | null>(null);
  // This case's own requirement rows, needed to add/remove individual documents.
  const [requirements, setRequirements] = useState<CreditCaseRequirement[] | null>(null);
  const [editingRequirements, setEditingRequirements] = useState(false);
  const [savingRequirement, setSavingRequirement] = useState(false);
  /*
   * Requirement edits are a DRAFT until the user clicks Done.
   *
   * They used to be written on every click, which left no honest meaning for "Done" and
   * no way to back out. Holding them here is what lets the Done prompt offer a Cancel
   * that sends nothing — and what lets the prompt describe the whole change at once
   * rather than one row at a time.
   *
   * Adds are file type ids (nothing exists to point at yet); removals are file type
   * keys, because that is what the case's checklist is keyed by.
   */
  const [pendingAddIds, setPendingAddIds] = useState<number[]>([]);
  const [pendingRemoveKeys, setPendingRemoveKeys] = useState<string[]>([]);
  // The organization's default template, so Done can offer to make this list the new
  // default. Null when the organization has never set one up.
  const [defaultTemplate, setDefaultTemplate] = useState<RequirementTemplate | null>(null);
  // Set while the Done prompt is open. Its presence IS the prompt.
  const [requirementImpact, setRequirementImpact] =
    useState<TemplateImpactEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [requestedAmount, setRequestedAmount] = useState("");
  const [requestedTermDays, setRequestedTermDays] = useState("30");
  // Per-case override of how many days this case has to reach a verdict. Kept as a
  // string because the box is empty when there is no override, and "" is not a number.
  const [verdictDueDays, setVerdictDueDays] = useState("");
  const [currency, setCurrency] = useState("MXN");
  const [status, setStatus] = useState("missing_documents");
  const [verdict, setVerdict] = useState("pending");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [users, setUsers] = useState<User[] | null>(null);

  /*
   * Custom fields, folded into the Details section rather than living in a panel of
   * their own further down the page.
   *
   * `drafts` holds only what the user has actually typed, keyed by label id; every other
   * field reads straight from `creditCase.custom_fields`, which the backend rebuilds
   * after each write. Keeping a second copy of the saved values here is exactly how the
   * two would eventually disagree.
   */
  const [customLabels, setCustomLabels] = useState<Label[] | null>(null);
  const [customDrafts, setCustomDrafts] = useState<Record<number, string>>({});
  // Values already recorded for each field elsewhere in the org, offered as a dropdown.
  const [customSuggestions, setCustomSuggestions] = useState<Record<number, string[]>>({});
  // The inline "Add field" form at the top of Details, so a user does not have to leave
  // the case to define a field they have just realised they need.
  const [addingField, setAddingField] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [addFieldError, setAddFieldError] = useState<string | null>(null);
  const [creatingField, setCreatingField] = useState(false);

  // The user's own arrangement of the Details cards, read on first render so the
  // section paints in their order rather than snapping into it.
  const [detailsOrder, setDetailsOrder] = useState<string[]>(
    () => loadLayout(DETAILS_LAYOUT_ID).order,
  );
  const [draggingDetail, setDraggingDetail] = useState(false);

  /**
   * The organization, for one thing only: the number that goes in the verdict deadline
   * placeholder. "Organization default" told the user a default existed without telling
   * them what it was, which is the one thing they need to decide whether to override it.
   */
  const [organization, setOrganization] = useState<Organization | null>(null);

  const [saving, setSaving] = useState(false);
  // Success confirmation for the Save button. Previously a save gave no feedback at all
  // beyond the spinner stopping, so there was no way to tell it had worked. Transient:
  // it takes itself down after a few seconds rather than lingering indefinitely.
  const { message: saved, show: showSaved, clear: clearSaved } = useTransientMessage();
  const [deleting, setDeleting] = useState(false);
  // Deletes and removals are irreversible, so each waits on an explicit confirmation.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [refreshingUploads, setRefreshingUploads] = useState(false);
  // Url of the document whose file type is being corrected, so only its badge spins.
  const [savingFileTypeUrl, setSavingFileTypeUrl] = useState<string | null>(null);
  // Url of the document being renamed, so only that row shows a spinner.
  const [renamingUrl, setRenamingUrl] = useState<string | null>(null);
  // Deleting a document can un-satisfy a requirement, so it waits on a confirmation.
  const [documentToDelete, setDocumentToDelete] = useState<UploadDocument | null>(null);
  const [deletingDocument, setDeletingDocument] = useState(false);

  /**
   * The values already recorded for one custom field, fetched per field.
   *
   * Re-fetched after a save as well as on load: a value the user has just invented
   * should be offered to the next case straight away. Failure is swallowed on purpose —
   * suggestions are a convenience, and losing them must not stop someone typing a value.
   */
  const loadCustomSuggestions = useCallback(async (label: Label) => {
    try {
      const values = await listExistingValues(label);
      setCustomSuggestions((prev) => ({ ...prev, [label.id]: values }));
    } catch {
      // Deliberately ignored — see above.
    }
  }, []);

  const loadUploads = useCallback(async (creditCaseUrl: string) => {
    const allUploads = await drfListAll<UploadDocument>({
      path: "/upload-documents/",
    });
    return allUploads.filter((u) => u.credit_case?.url === creditCaseUrl);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const [cc, allUsers] = await Promise.all([
          apiJson<CreditCase>({ pathOrUrl: `/credit-cases/${id}/` }),
          drfListAll<User>({ path: "/users/" }),
        ]);
        if (cancelled) return;
        setCreditCase(cc);
        setRequestedAmount(cc.requested_amount ?? "");
        setRequestedTermDays(String(cc.requested_term_days ?? 30));
        setVerdictDueDays(cc.verdict_due_days == null ? "" : String(cc.verdict_due_days));
        setCurrency(cc.currency ?? "MXN");
        setStatus(cc.status ?? "missing_documents");
        setVerdict(cc.verdict ?? "pending");
        setAssignedTo(cc.assigned_to?.url ?? "");
        setUsers(allUsers);

        const cust = await apiJson<Customer>({ pathOrUrl: cc.customer.url });
        if (cancelled) return;
        setCustomer(cust);

        const [caseUploads, catalog, caseRequirements, orgTemplate, orgs, labels] =
          await Promise.all([
            loadUploads(cc.url),
            listFileTypes(),
            listCreditCaseRequirements(cc),
            // Only needed if the user edits requirements, but fetching it here keeps
            // Done a single decision rather than a load followed by a decision. A
            // failure degrades to "no default template", which the flow already handles.
            getDefaultTemplate().catch(() => null),
            // Both of these are decoration on an otherwise working page — the deadline
            // placeholder and the custom field cards — so neither is allowed to take
            // the whole case down with it.
            drfListAll<Organization>({ path: "/organizations/" }).catch(
              () => [] as Organization[],
            ),
            listCreditCaseLabels().catch(() => [] as Label[]),
          ]);
        if (cancelled) return;
        setUploads(caseUploads);
        setFileTypes(catalog);
        setRequirements(caseRequirements);
        setDefaultTemplate(orgTemplate);
        // A user belongs to one organization in practice; the list endpoint is already
        // scoped to theirs, so the first row is it.
        setOrganization(orgs[0] ?? null);
        setCustomLabels(labels);
        void Promise.all(labels.map((label) => loadCustomSuggestions(label)));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Failed to load credit case");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, loadUploads, loadCustomSuggestions]);

  const uploadedTypeNames = useMemo(() => {
    if (!uploads) return new Set<string>();
    const names = uploads
      .map((u) => u.file_type_name)
      .filter((name) => Boolean(name) && name !== "unknown");
    return new Set(names as string[]);
  }, [uploads]);

  const requiredFileStatuses = useMemo(() => {
    return (creditCase?.required_file_type_names ?? []).map((fileType) => ({
      fileType,
      label: fileTypeLabel(fileType, fileTypes),
      satisfied: uploadedTypeNames.has(fileType),
    }));
  }, [creditCase?.required_file_type_names, uploadedTypeNames, fileTypes]);

  // Optional documents are listed for the user's benefit but never block completion,
  // so they are shown apart from the required ones.
  const optionalFileStatuses = useMemo(() => {
    return (creditCase?.optional_file_type_names ?? []).map((fileType) => ({
      fileType,
      label: fileTypeLabel(fileType, fileTypes),
      satisfied: uploadedTypeNames.has(fileType),
    }));
  }, [creditCase?.optional_file_type_names, uploadedTypeNames, fileTypes]);

  /**
   * The document types this case does not already ask for.
   *
   * Filtered here rather than inside the picker so the picker stays presentational and
   * both callers keep deciding for themselves what is offerable.
   */
  const addableFileTypes = useMemo(() => {
    if (!fileTypes) return [];
    const alreadyAsked = new Set([
      ...requiredFileStatuses.map((r) => r.fileType),
      ...optionalFileStatuses.map((r) => r.fileType),
    ]);
    return fileTypes.filter((fileType) => !alreadyAsked.has(fileType.key));
  }, [fileTypes, requiredFileStatuses, optionalFileStatuses]);

  /**
   * The required-documents checklist as the user is currently building it.
   *
   * `pending` marks a row the user has changed but not yet saved: "add" for one they
   * queued, "remove" for one they queued to drop (kept on screen, struck through, so
   * the change is visible and undoable rather than silently gone).
   */
  const requirementDraft = useMemo(() => {
    const queuedAdds = pendingAddIds
      .map((id) => (fileTypes ?? []).find((f) => f.id === id))
      .filter((f): f is FileType => Boolean(f))
      .map((fileType) => ({
        fileType: fileType.key,
        label: fileTypeLabel(fileType.key, fileTypes),
        satisfied: uploadedTypeNames.has(fileType.key),
        pending: "add" as const,
      }));

    return [
      ...requiredFileStatuses.map((req) => ({
        ...req,
        pending: pendingRemoveKeys.includes(req.fileType)
          ? ("remove" as const)
          : null,
      })),
      ...queuedAdds,
    ];
  }, [
    requiredFileStatuses,
    pendingAddIds,
    pendingRemoveKeys,
    fileTypes,
    uploadedTypeNames,
  ]);

  const hasPendingRequirementEdits =
    pendingAddIds.length > 0 || pendingRemoveKeys.length > 0;

  /**
   * The file type ids this case would require once the draft is applied.
   *
   * This is also what "make it the organization's default" would save, which is why it
   * is derived from the draft rather than read back after saving: the user is being
   * asked about a list that does not exist anywhere yet.
   */
  const draftFileTypeIds = useMemo(() => {
    const byKey = new Map((fileTypes ?? []).map((f) => [f.key, f.id]));
    return requirementDraft
      .filter((row) => row.pending !== "remove")
      .map((row) => byKey.get(row.fileType))
      .filter((id): id is number => id !== undefined);
  }, [requirementDraft, fileTypes]);

  /**
   * Re-read the case and its requirements after an add/remove.
   *
   * The case has to come back too: a manual requirement change can flip
   * `requirements_complete` and move `status` (adding one pulls a waiting case back to
   * "missing documents"; removing the last outstanding one advances it).
   */
  /**
   * Put a freshly-fetched case on screen, including the fields the edit form binds to.
   *
   * The form inputs are separate state, so setting only `creditCase` would leave the
   * Status and Verdict selects showing what the user last saw rather than what the
   * backend now holds — which is exactly how an upload that advanced the case ended up
   * needing a page refresh to be visible.
   */
  const applyCase = useCallback((refreshed: CreditCase) => {
    setCreditCase(refreshed);
    setStatus(refreshed.status ?? "missing_documents");
    setVerdict(refreshed.verdict ?? "pending");
    setAssignedTo(refreshed.assigned_to?.url ?? "");
  }, []);

  async function refreshRequirements(current: CreditCase) {
    const [refreshedCase, caseRequirements] = await Promise.all([
      apiJson<CreditCase>({ pathOrUrl: current.url }),
      listCreditCaseRequirements(current),
    ]);
    applyCase(refreshedCase);
    setRequirements(caseRequirements);
  }

  /** Queue a document to be required. Nothing is sent until Done. */
  function queueAddRequirement(fileTypeId: number) {
    setPendingAddIds((ids) => (ids.includes(fileTypeId) ? ids : [...ids, fileTypeId]));
  }

  /**
   * Queue a required document to be dropped, or take back either kind of queued edit.
   *
   * One function for both because "undo" is just the inverse of whichever list the row
   * is in: a queued add disappears, an existing row stops being marked for removal.
   */
  function toggleQueuedRemoval(fileTypeKey: string) {
    const queuedAdd = (fileTypes ?? []).find((f) => f.key === fileTypeKey);
    if (queuedAdd && pendingAddIds.includes(queuedAdd.id)) {
      setPendingAddIds((ids) => ids.filter((id) => id !== queuedAdd.id));
      return;
    }
    setPendingRemoveKeys((keys) =>
      keys.includes(fileTypeKey)
        ? keys.filter((key) => key !== fileTypeKey)
        : [...keys, fileTypeKey],
    );
  }

  function discardRequirementDraft() {
    setPendingAddIds([]);
    setPendingRemoveKeys([]);
  }

  /**
   * Write the draft to this case, and optionally make it the organization's default.
   *
   * The per-case rows go first and always: they are what the user was actually editing.
   * The template is only touched when they asked for it, and applying it to the other
   * open cases is a separate call because the user is allowed to want one without the
   * other.
   */
  async function commitRequirementDraft(options: { alsoUpdateDefault: boolean }) {
    if (!creditCase) return;
    setSavingRequirement(true);
    setError(null);
    try {
      for (const fileTypeId of pendingAddIds) {
        await addCreditCaseRequirement({ creditCase, fileTypeId });
      }
      for (const key of pendingRemoveKeys) {
        const row = (requirements ?? []).find((r) => r.file_type_key === key);
        if (row) await removeCreditCaseRequirement(row);
      }

      if (options.alsoUpdateDefault) {
        const template = defaultTemplate
          ? await updateTemplateItems({
              template: defaultTemplate,
              fileTypeIds: draftFileTypeIds,
            })
          : await createDefaultTemplate({ fileTypeIds: draftFileTypeIds });
        setDefaultTemplate(template);

        const creditCaseIds = (requirementImpact ?? []).map(
          (entry) => entry.credit_case_id,
        );
        if (creditCaseIds.length > 0) {
          await applyTemplateToCases({ template, creditCaseIds });
        }
      }

      discardRequirementDraft();
      setRequirementImpact(null);
      setEditingRequirements(false);
      await refreshRequirements(creditCase);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save requirements");
    } finally {
      setSavingRequirement(false);
    }
  }

  /**
   * Done: ask before writing anything.
   *
   * With no queued edits there is nothing to ask about, so this just closes the editor —
   * no prompt and no request. Otherwise the backend is asked what making this list the
   * organization's default would do to the OTHER open cases, and that answer is what the
   * prompt shows. This case is filtered out of it: it is written directly either way, so
   * listing it here would count it twice.
   */
  async function handleDoneEditingRequirements() {
    if (!hasPendingRequirementEdits) {
      setEditingRequirements(false);
      return;
    }

    setSavingRequirement(true);
    setError(null);
    try {
      const entries = defaultTemplate
        ? await previewTemplateImpact({
            template: defaultTemplate,
            fileTypeIds: draftFileTypeIds,
          })
        : [];
      setRequirementImpact(
        entries.filter((entry) => entry.credit_case_id !== creditCase?.id),
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to check what this change would affect",
      );
    } finally {
      setSavingRequirement(false);
    }
  }

  /** The edit controls as they'd look straight from the server, with nothing changed. */
  function creditCaseFormValues(source: CreditCase | null) {
    return {
      requestedAmount: source?.requested_amount ?? "",
      requestedTermDays: String(source?.requested_term_days ?? 30),
      verdictDueDays:
        source?.verdict_due_days == null ? "" : String(source.verdict_due_days),
      currency: source?.currency ?? "MXN",
      status: source?.status ?? "missing_documents",
      verdict: source?.verdict ?? "pending",
      assignedTo: source?.assigned_to?.url ?? "",
    };
  }

  /** What this case currently holds for a custom field, or "" when it was never set. */
  const savedCustomValue = useCallback(
    (label: Label) => customFieldValue(creditCase?.custom_fields, label.name) ?? "",
    [creditCase?.custom_fields],
  );

  /** What a custom field's box shows: unsaved text if typed, else the saved value. */
  const customValue = useCallback(
    (label: Label) => customDrafts[label.id] ?? savedCustomValue(label),
    [customDrafts, savedCustomValue],
  );

  /** The custom fields whose box no longer matches what the server holds. */
  const dirtyCustomLabels = useMemo(
    () =>
      (customLabels ?? []).filter(
        (label) => customValue(label).trim() !== savedCustomValue(label),
      ),
    [customLabels, customValue, savedCustomValue],
  );

  /** True when a control no longer matches what was loaded, so there is work to lose. */
  const hasUnsavedChanges = useMemo(() => {
    const saved = creditCaseFormValues(creditCase);
    return (
      requestedAmount !== saved.requestedAmount ||
      requestedTermDays !== saved.requestedTermDays ||
      verdictDueDays !== saved.verdictDueDays ||
      currency !== saved.currency ||
      status !== saved.status ||
      verdict !== saved.verdict ||
      assignedTo !== saved.assignedTo ||
      // Custom fields now share this section's Save button, so they have to count as
      // unsaved work too — otherwise Discard would sit disabled over changed boxes.
      dirtyCustomLabels.length > 0
    );
  }, [
    creditCase,
    requestedAmount,
    requestedTermDays,
    verdictDueDays,
    currency,
    status,
    verdict,
    assignedTo,
    dirtyCustomLabels,
  ]);

  /** Put every control back to the loaded case, abandoning what was changed. */
  function handleDiscardChanges() {
    const saved = creditCaseFormValues(creditCase);
    setRequestedAmount(saved.requestedAmount);
    setRequestedTermDays(saved.requestedTermDays);
    setVerdictDueDays(saved.verdictDueDays);
    setCurrency(saved.currency);
    setStatus(saved.status);
    setVerdict(saved.verdict);
    setAssignedTo(saved.assignedTo);
    setCustomDrafts({});
    clearSaved();
    setError(null);
  }

  /**
   * Save the whole Details section: the case's own fields, then any custom field the
   * user changed.
   *
   * One button for the section, because every card in it now looks the same and a
   * per-card Save would have been the one thing that did not. The case is PATCHed first
   * and the custom values written after, so a rejected amount (say) stops the whole
   * save rather than leaving half of it applied.
   *
   * An emptied box is a delete, not a save of "": the backend would otherwise keep a row
   * holding an empty string, and that row would show up as a filterable value on the
   * dashboard.
   */
  async function handleSaveDetails() {
    if (!creditCase) return;
    setSaving(true);
    setError(null);
    clearSaved();
    try {
      const updated = await apiJson<CreditCase>({
        pathOrUrl: creditCase.url,
        method: "PATCH",
        body: {
          requested_amount: requestedAmount.trim() || null,
          currency,
          requested_term_days: Number(requestedTermDays),
          // Empty box means null, which the backend reads as "use the organization
          // default" — not "no deadline".
          verdict_due_days: verdictDueDays.trim() ? Number(verdictDueDays) : null,
          customer: creditCase.customer.url,
          status,
          verdict,
          assigned_to: assignedTo || null,
        },
      });

      for (const label of dirtyCustomLabels) {
        const value = customValue(label).trim();
        if (value === "") {
          await clearLabelValue({ label, objectId: creditCase.id });
        } else {
          await setLabelValue({ label, objectId: creditCase.id, value });
        }
      }

      if (dirtyCustomLabels.length > 0) {
        // Re-read rather than trusting `updated`: it was serialised before the label
        // values were written, so its `custom_fields` is already one step behind.
        const refreshed = await apiJson<CreditCase>({ pathOrUrl: creditCase.url });
        applyCase(refreshed);
        void Promise.all(dirtyCustomLabels.map((l) => loadCustomSuggestions(l)));
      } else {
        applyCase(updated);
      }

      setCustomDrafts({});
      showSaved("Saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Define a new custom field without leaving the case.
   *
   * The field is created empty and is NOT backfilled onto existing cases — the same
   * behaviour as creating one on `/labels`. It appears here immediately so the user can
   * fill it in for this case, which is usually why they wanted it.
   */
  async function handleAddField() {
    const name = newFieldName.trim();
    const problem = validateLabelName(name, customLabels ?? []);
    if (problem) {
      setAddFieldError(problem);
      return;
    }
    setCreatingField(true);
    setAddFieldError(null);
    try {
      const created = await createLabel(name);
      setCustomLabels((prev) => [...(prev ?? []), created]);
      setNewFieldName("");
      setAddingField(false);
      void loadCustomSuggestions(created);
    } catch (err) {
      setAddFieldError(
        err instanceof ApiError ? err.message : "Failed to add the field",
      );
    } finally {
      setCreatingField(false);
    }
  }

  function handleReorderDetail(draggedId: string, targetId: string) {
    const next = moveItem(detailFieldIds, draggedId, targetId);
    setDetailsOrder(next);
    saveLayout(DETAILS_LAYOUT_ID, { order: next, hidden: [] });
  }

  async function handleDeleteCreditCase() {
    if (!creditCase) return;
    setDeleting(true);
    setError(null);
    try {
      await apiJson<void>({ pathOrUrl: creditCase.url, method: "DELETE" });
      router.push("/credit-cases");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  /**
   * Re-read the uploads AND the credit case itself.
   *
   * The case has to be re-read too: classification runs in a background worker after an
   * upload, and completing the last required document flips `requirements_complete` and
   * can advance `status`. Refreshing only the uploads would leave those stale on screen.
   */
  async function refreshUploads() {
    if (!creditCase) return;
    setRefreshingUploads(true);
    setError(null);
    try {
      await reloadCaseAndUploads(creditCase);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to refresh uploads");
    } finally {
      setRefreshingUploads(false);
    }
  }

  /** Re-read everything an upload can change, in one round trip. */
  async function reloadCaseAndUploads(current: CreditCase) {
    const [caseUploads, refreshedCase, caseRequirements] = await Promise.all([
      loadUploads(current.url),
      apiJson<CreditCase>({ pathOrUrl: current.url }),
      listCreditCaseRequirements(current),
    ]);
    setUploads(caseUploads);
    setRequirements(caseRequirements);
    applyCase(refreshedCase);
  }

  /**
   * Upload the chosen files, then re-read the case.
   *
   * The upload answers as soon as the rows are saved — classification runs afterwards in
   * a Celery worker — so this re-read shows the new documents immediately, still marked
   * as being classified. `useClassificationPolling` then brings in each file type as the
   * worker answers, along with the `requirements_complete` / `status` changes that
   * finishing the last required document causes.
   */
  async function handleUpload(chosen: File[]) {
    if (!creditCase || !customer) return;
    setError(null);

    await Promise.all(
      chosen.map(async (file) => {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("credit_case", creditCase.url);
        fd.append("customer", customer.url);
        return apiForm<UploadDocument[]>({
          pathOrUrl: "/upload-documents/",
          method: "POST",
          form: fd,
        });
      }),
    );

    await reloadCaseAndUploads(creditCase);
  }

  /**
   * Give a document a name a reviewer will recognize.
   *
   * Only the display label changes — the stored file and its original name are untouched
   * — so nothing about the requirement checklist can move here, and the case does not
   * need re-reading.
   */
  async function handleRenameDocument(doc: UploadDocument, friendlyName: string | null) {
    setRenamingUrl(doc.url);
    setError(null);
    try {
      const updated = await apiJson<UploadDocument>({
        pathOrUrl: doc.url,
        method: "PATCH",
        body: { friendly_file_name: friendlyName },
      });
      setUploads((prev) => (prev ?? []).map((u) => (u.url === updated.url ? updated : u)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to rename document");
    } finally {
      setRenamingUrl(null);
    }
  }

  /**
   * Delete a document from this case.
   *
   * Re-reads the case afterwards: the backend recomputes the case's status on delete, so
   * removing the file that satisfied the last requirement pulls the case back to
   * "missing documents" — which the user should see happen.
   */
  async function handleDeleteDocument(doc: UploadDocument) {
    if (!creditCase) return;
    setDeletingDocument(true);
    setError(null);
    try {
      await apiJson<void>({ pathOrUrl: doc.url, method: "DELETE" });
      setDocumentToDelete(null);
      await reloadCaseAndUploads(creditCase);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete document");
    } finally {
      setDeletingDocument(false);
    }
  }

  /**
   * Correct a document GPT labelled wrongly.
   *
   * Re-reads the case afterwards because the type IS what satisfies a requirement:
   * relabelling a file can complete the checklist (or un-complete it).
   */
  async function handleChangeFileType(doc: UploadDocument, key: string) {
    if (!creditCase) return;
    setSavingFileTypeUrl(doc.url);
    setError(null);
    try {
      await apiJson<UploadDocument>({
        pathOrUrl: doc.url,
        method: "PATCH",
        body: { file_type_name: key },
      });
      await reloadCaseAndUploads(creditCase);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to change file type");
    } finally {
      setSavingFileTypeUrl(null);
    }
  }

  /**
   * While a Celery worker is still classifying an upload, keep re-reading — the file type
   * appears on the server seconds after the upload request answered, with nothing to tell
   * the browser. Re-reads the CASE too (`reloadCaseAndUploads`), because the type is what
   * satisfies a requirement: the last document landing can flip `requirements_complete`
   * and advance the status.
   */
  useClassificationPolling({
    documents: uploads,
    onRefresh: () => {
      if (creditCase) return reloadCaseAndUploads(creditCase);
    },
  });

  /**
   * Every card in the Details section, in its natural order.
   *
   * One list drives the whole section: what is rendered, what can be dragged, and what
   * order the user's saved arrangement is applied to. Built-in fields and the
   * organization's own custom fields sit in the same list on purpose — to a user reading
   * the case they are the same kind of thing, and the only difference worth showing is
   * the small blue marker on a custom one.
   */
  const detailFields = useMemo<
    {
      id: string;
      label: string;
      hint?: string;
      custom?: boolean;
      tone?: "default" | "danger";
      render: () => React.ReactNode;
    }[]
  >(() => {
    const orgDefaultDays = organization?.default_verdict_days;

    const builtIn = [
      {
        id: "customer",
        label: "Customer",
        render: () => (
          <DetailValue>
            {customer ? (
              <Link href={`/customers/${customer.id}`} className="text-fg underline">
                {customer.name}
              </Link>
            ) : (
              "—"
            )}
          </DetailValue>
        ),
      },
      {
        id: "status",
        label: "Status",
        render: () => (
          <div className="relative">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={!creditCase}
              aria-label="Status"
              className="w-full rounded-md border bg-surface py-2 pl-8 pr-3 text-sm disabled:opacity-60"
            >
              {Object.entries(CREDIT_CASE_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
              <StatusDot status={status} />
            </span>
          </div>
        ),
      },
      {
        id: "verdict",
        label: "Verdict",
        render: () => (
          <select
            value={verdict}
            onChange={(e) => setVerdict(e.target.value)}
            disabled={!creditCase}
            aria-label="Verdict"
            className="w-full rounded-md border bg-surface px-3 py-2 text-sm disabled:opacity-60"
          >
            {Object.entries(CREDIT_CASE_VERDICT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        ),
      },
      {
        id: "assignedTo",
        label: "Assigned to",
        render: () => (
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            disabled={!creditCase}
            aria-label="Assigned to"
            className="w-full rounded-md border bg-surface px-3 py-2 text-sm disabled:opacity-60"
          >
            <option value="">Unassigned</option>
            {(users ?? []).map((u) => (
              <option key={u.url} value={u.url}>
                {u.first_name && u.last_name
                  ? `${u.first_name} ${u.last_name}`
                  : u.email}
              </option>
            ))}
          </select>
        ),
      },
      {
        id: "requestedAmount",
        label: "Requested amount",
        render: () => (
          <MoneyInput
            value={requestedAmount}
            onChange={setRequestedAmount}
            aria-label="Requested amount"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        ),
      },
      {
        id: "currency",
        label: "Currency",
        render: () => (
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            aria-label="Currency"
            className="w-full rounded-md border bg-surface px-3 py-2 text-sm"
          >
            {CURRENCY_OPTIONS.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        ),
      },
      {
        id: "requestedTerm",
        label: "Requested term (days)",
        render: () => (
          <select
            value={requestedTermDays}
            onChange={(e) => setRequestedTermDays(e.target.value)}
            aria-label="Requested term (days)"
            className="w-full rounded-md border bg-surface px-3 py-2 text-sm"
          >
            {REQUESTED_TERM_DAYS_OPTIONS.map((days) => (
              <option key={days} value={String(days)}>
                Net {days}
              </option>
            ))}
          </select>
        ),
      },
      {
        id: "verdictDueDays",
        label: "Verdict deadline (days)",
        // Behind an icon rather than printed under the box: it is a paragraph the user
        // needs once, and it was making this one card twice the height of every other.
        hint: "Leave blank to use your organization's default deadline. Set a number only when this case needs more or less time than the rest.",
        render: () => (
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={verdictDueDays}
            onChange={(e) => setVerdictDueDays(e.target.value)}
            disabled={!creditCase}
            aria-label="Verdict deadline (days)"
            // The organization's actual number, not the words "Organization default":
            // knowing a default exists is no help in deciding whether to override it.
            placeholder={
              orgDefaultDays == null
                ? "Organization default"
                : `${orgDefaultDays} (organization default)`
            }
            className="w-full rounded-md border bg-surface px-3 py-2 text-sm disabled:opacity-60"
          />
        ),
      },
      {
        id: "verdictDue",
        label: "Verdict due",
        // An overdue verdict is the one number on this page a reviewer has to act on,
        // so the whole card switches to the danger tokens rather than only the wording.
        tone: creditCase?.is_verdict_overdue ? ("danger" as const) : ("default" as const),
        render: () => (
          <DetailValue tone={creditCase?.is_verdict_overdue ? "danger" : "default"}>
            {verdictDueLabel(creditCase?.days_until_verdict_due)}
            {creditCase?.verdict_due_at && (
              <span className="ml-2 text-xs font-normal text-fg-subtle">
                {formatDate(creditCase.verdict_due_at)}
              </span>
            )}
          </DetailValue>
        ),
      },
      {
        id: "daysOpen",
        label: "Days open",
        render: () => (
          <DetailValue>
            {creditCase?.days_since_created == null
              ? "—"
              : `${creditCase.days_since_created} ${
                  creditCase.days_since_created === 1 ? "day" : "days"
                }`}
          </DetailValue>
        ),
      },
      {
        id: "decided",
        label: "Decided",
        render: () => (
          <DetailValue>
            {creditCase?.verdict_at ? formatDate(creditCase.verdict_at) : "—"}
          </DetailValue>
        ),
      },
      {
        id: "created",
        label: "Created",
        render: () => (
          <DetailValue>
            {creditCase ? formatDate(creditCase.created_at) : "—"}
          </DetailValue>
        ),
      },
    ];

    const custom = (customLabels ?? []).map((label) => ({
      // Same id scheme as the dashboard's label columns, so "label:7" means the same
      // thing in both saved arrangements.
      id: labelColumnId(label),
      label: label.name,
      custom: true,
      render: () => (
        <ValueCombobox
          value={customValue(label)}
          onChange={(value) =>
            setCustomDrafts((prev) => ({ ...prev, [label.id]: value }))
          }
          options={customSuggestions[label.id] ?? []}
          maxLength={LABEL_VALUE_MAX_LENGTH}
          disabled={!creditCase}
          ariaLabel={label.name}
          // Says the quiet part out loud: a value is created by using it here. Users
          // were going looking for a page to define one on, which does not exist.
          placeholder="Pick or type a value"
          className="w-full"
        />
      ),
    }));

    return [...builtIn, ...custom];
  }, [
    creditCase,
    customer,
    users,
    status,
    verdict,
    assignedTo,
    requestedAmount,
    currency,
    requestedTermDays,
    verdictDueDays,
    organization,
    customLabels,
    customSuggestions,
    customValue,
  ]);

  /** The cards in the user's saved order, with anything new at the end. */
  const orderedDetailFields = useMemo(
    () => applyOrder(detailFields, detailsOrder),
    [detailFields, detailsOrder],
  );

  const detailFieldIds = useMemo(
    () => orderedDetailFields.map((field) => field.id),
    [orderedDetailFields],
  );


  return (
    <AppShell>
      <RequireAuth>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {customer ? `${customer.name} ${creditCase?.id}` : creditCase ? `Credit case #${creditCase.id}` : ""}
            </h1>
            <p className="mt-2 text-sm text-fg-muted">
              Update request fields, track required documents, and upload files.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/credit-cases"
              className="rounded-md border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-subtle"
            >
              Back
            </Link>
            <button
              type="button"
              disabled={!creditCase || deleting}
              onClick={() => setConfirmingDelete(true)}
              className="rounded-md border border-danger-line bg-surface px-3 py-2 text-sm font-medium text-danger hover:bg-danger-surface disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>

        <ConfirmDialog
          open={confirmingDelete}
          title="Delete this credit case?"
          name={
            creditCase
              ? `${customer?.name ?? "Credit case"} #${creditCase.id}`
              : undefined
          }
          description="Its uploaded documents and requirement list go with it."
          busy={deleting}
          onConfirm={() => void handleDeleteCreditCase()}
          onCancel={() => setConfirmingDelete(false)}
        />

        {/* Raised by Done, and the only confirmation the requirement editor needs: a
            queued removal is undoable right up until this point, so a per-row "are you
            sure?" would have been asking about something that had not happened yet.

            Same three choices, and the same component, as the Requirements page — with
            one extra job, because the user is deciding about this case as well as the
            rest. "Only this case" still writes the draft; Cancel writes nothing at all
            and leaves the draft on screen to keep adjusting. */}
        {requirementImpact !== null && (
          <ImpactWarning
            entries={requirementImpact}
            busy={savingRequirement}
            title="Make this your default and update cases in progress?"
            intro={
              requirementImpact.length > 0
                ? `Saving this as your organization's default would also change ${requirementImpact.length} other open credit case${requirementImpact.length === 1 ? "" : "s"}. Submitted cases are never changed.`
                : "This case's documents will be saved either way. You can also make this list your organization's default for new credit cases."
            }
            applyLabel="Update all"
            keepLabel="Only this case"
            onApply={() => void commitRequirementDraft({ alsoUpdateDefault: true })}
            onKeep={() => void commitRequirementDraft({ alsoUpdateDefault: false })}
            onCancel={() => setRequirementImpact(null)}
          />
        )}

        <ConfirmDialog
          open={documentToDelete !== null}
          title="Delete this document?"
          name={documentToDelete ? documentDisplayName(documentToDelete) : undefined}
          description="If this file was satisfying a required document, this case goes back to missing it."
          busy={deletingDocument}
          onConfirm={() => {
            if (documentToDelete) void handleDeleteDocument(documentToDelete);
          }}
          onCancel={() => setDocumentToDelete(null)}
        />

        {error ? (
          <div className="mt-6 rounded-md border border-danger-line bg-danger-surface p-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2 rounded-lg border bg-surface p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Details</h2>
                <p className="mt-1 text-xs text-fg-subtle">
                  Drag a field by its handle to arrange this section however you like —
                  your arrangement is remembered.
                </p>
              </div>

              {/* Custom fields used to be defined only on /labels, which meant leaving
                  the case you were looking at to add the field you wanted for it. */}
              {!addingField ? (
                <button
                  type="button"
                  onClick={() => {
                    setAddingField(true);
                    setAddFieldError(null);
                  }}
                  className="rounded-md border px-3 py-1.5 text-xs font-medium text-fg-secondary hover:bg-surface-subtle"
                >
                  + Add field
                </button>
              ) : (
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={newFieldName}
                      maxLength={LABEL_NAME_MAX_LENGTH}
                      aria-label="New field name"
                      placeholder="e.g. sucursal"
                      onChange={(e) => {
                        setNewFieldName(e.target.value);
                        setAddFieldError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleAddField();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setAddingField(false);
                          setNewFieldName("");
                          setAddFieldError(null);
                        }
                      }}
                      className="w-48 rounded-md border bg-surface px-3 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      disabled={creatingField}
                      onClick={() => void handleAddField()}
                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-fg hover:bg-primary-hover disabled:opacity-60"
                    >
                      {creatingField ? "Adding…" : "Add"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingField(false);
                        setNewFieldName("");
                        setAddFieldError(null);
                      }}
                      className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-surface-subtle"
                    >
                      Cancel
                    </button>
                  </div>
                  {addFieldError && (
                    <p className="text-xs text-danger">{addFieldError}</p>
                  )}
                  <p className="text-xs text-fg-subtle">
                    Applies to every credit case. Existing cases are not filled in.
                  </p>
                </div>
              )}
            </div>

            {/* One grid for the whole section. Every card is the same shape whether it
                holds a form control or a value nobody can edit here — the section used
                to mix read-only tiles, form controls and a separate custom fields panel,
                which read as three different kinds of thing. */}
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {orderedDetailFields.map((field) => (
                <DetailField
                  key={field.id}
                  id={field.id}
                  label={field.label}
                  hint={field.hint}
                  custom={field.custom}
                  tone={field.tone}
                  dragging={draggingDetail}
                  onDragStateChange={setDraggingDetail}
                  onReorder={(draggedId) => handleReorderDetail(draggedId, field.id)}
                >
                  {field.render()}
                </DetailField>
              ))}
            </div>

            {customLabels !== null && customLabels.length === 0 && !addingField && (
              <p className="mt-4 text-xs text-fg-subtle">
                Your organization has not defined any custom fields yet. Use “Add field”
                above, or manage them on{" "}
                <Link href="/labels" className="underline">
                  the custom fields page
                </Link>
                .
              </p>
            )}

            <div className="mt-4 flex items-center justify-end gap-3">
              {/* Confirms the save actually landed. `aria-live` so it is announced
                  rather than only appearing. */}
              {saved && (
                <span
                  aria-live="polite"
                  className="rounded-md border border-success-line bg-success-surface px-3 py-2 text-sm text-success"
                >
                  {saved}
                </span>
              )}
              <button
                type="button"
                onClick={handleDiscardChanges}
                disabled={!creditCase || saving || !hasUnsavedChanges}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-surface-subtle disabled:opacity-60"
              >
                Discard changes
              </button>
              <button
                type="button"
                disabled={!creditCase || saving}
                onClick={() => void handleSaveDetails()}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </section>

          <section className="rounded-lg border bg-surface p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold">Required documents</h2>

              {/* Only meaningful once the case actually has requirements — a case with
                  none isn't "incomplete", it just hasn't been set up yet. */}
              <div className="flex shrink-0 items-center gap-2">
                {(requiredFileStatuses.length > 0 ||
                  optionalFileStatuses.length > 0) && (
                  <span
                    className={[
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      creditCase?.requirements_complete
                        ? "bg-success-surface-strong text-success"
                        : "bg-warning-surface-strong text-warning",
                    ].join(" ")}
                  >
                    {creditCase?.requirements_complete
                      ? "Complete"
                      : `${requiredFileStatuses.filter((r) => !r.satisfied).length} missing`}
                  </span>
                )}

                {/* Once a case is submitted its requirement list is the reviewer's
                    evidence, so the backend refuses edits — don't offer them either. */}
                {creditCase && !creditCase.submitted_at && (
                  <button
                    type="button"
                    disabled={savingRequirement}
                    onClick={() => {
                      if (editingRequirements) {
                        void handleDoneEditingRequirements();
                      } else {
                        setEditingRequirements(true);
                      }
                    }}
                    className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-surface-subtle disabled:opacity-60"
                  >
                    {editingRequirements ? "Done" : "Edit"}
                  </button>
                )}
              </div>
            </div>

            <p className="mt-2 text-sm text-fg-muted">
              The documents this credit case needs. Upload files below; the backend
              classifies each file after upload and ticks off whatever it matches.
            </p>

            {creditCase?.requirements_completed_at && (
              <p className="mt-2 text-xs text-fg-subtle">
                Requirements first met {formatDate(creditCase.requirements_completed_at)}
                {!creditCase.requirements_complete &&
                  " — a document has been required since then"}
              </p>
            )}

            {requirementDraft.length === 0 &&
              optionalFileStatuses.length === 0 && (
                <div className="mt-4 rounded-md border border-dashed p-4 text-sm text-fg-muted">
                  No required documents set for this credit case.{" "}
                  <Link href="/requirements" className="underline">
                    Set up your default requirements
                  </Link>
                  .
                </div>
              )}

            {requirementDraft.length > 0 && (
              <ul className="mt-4 space-y-2">
                {requirementDraft.map((req) => {
                  const removing = req.pending === "remove";
                  return (
                    <li
                      key={req.fileType}
                      className={[
                        "flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm",
                        // A queued edit is shown as a change in progress rather than as
                        // a finished state: dashed while it is only a draft, struck
                        // through where it is on its way out.
                        req.pending ? "border-dashed" : "",
                      ].join(" ")}
                    >
                      <span className={removing ? "text-fg-subtle line-through" : ""}>
                        {req.label}
                      </span>
                      <div className="flex items-center gap-2">
                        {req.pending ? (
                          <span className="text-xs font-medium text-fg-subtle">
                            {removing ? "Removing" : "Adding"}
                          </span>
                        ) : (
                          <span
                            className={
                              req.satisfied
                                ? "text-xs font-medium text-success"
                                : "text-xs font-medium text-warning"
                            }
                          >
                            {req.satisfied ? "Uploaded" : "Missing"}
                          </span>
                        )}
                        {editingRequirements && (
                          <button
                            type="button"
                            disabled={savingRequirement}
                            onClick={() => toggleQueuedRemoval(req.fileType)}
                            aria-label={
                              req.pending
                                ? `Undo ${req.label}`
                                : `Remove ${req.label}`
                            }
                            className={[
                              "rounded-md border px-2 py-0.5 text-xs font-medium disabled:opacity-60",
                              req.pending
                                ? "hover:bg-surface-subtle"
                                : "border-danger-line text-danger hover:bg-danger-surface",
                            ].join(" ")}
                          >
                            {req.pending ? "Undo" : "Remove"}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {editingRequirements && fileTypes && (
              <div className="mt-4 rounded-md border border-dashed p-3">
                <p className="text-xs font-medium text-fg-secondary">
                  Add a document this credit case needs
                </p>
                <p className="mt-1 text-xs text-fg-subtle">
                  Nothing is saved until you press Done — you will be asked then whether
                  this should also become your organization&apos;s default.
                </p>
                <div className="mt-3">
                  {/* Same grouped, searchable list the requirement chooser uses, so
                      finding one document among 22 works the same way everywhere.
                      No `selectedIds`: a click here is an action (add it now), not a
                      selection the user builds up. */}
                  <FileTypePicker
                    fileTypes={addableFileTypes}
                    prefix="+"
                    disabled={savingRequirement}
                    busy={savingRequirement}
                    searchLabel="Search documents to add"
                    emptyMessage={
                      addableFileTypes.length === 0
                        ? "This case already asks for every document type."
                        : "No documents match your search."
                    }
                    onPick={queueAddRequirement}
                  />
                </div>
              </div>
            )}

            {optionalFileStatuses.length > 0 && (
              <>
                <p className="mt-6 text-xs font-medium uppercase tracking-wide text-fg-subtle">
                  Optional
                </p>
                <ul className="mt-2 space-y-2">
                  {optionalFileStatuses.map((req) => (
                    <li
                      key={req.fileType}
                      className="flex items-center justify-between rounded-md border border-dashed px-3 py-2 text-sm"
                    >
                      <span className="text-fg-secondary">{req.label}</span>
                      <span className="text-xs font-medium text-fg-subtle">
                        {req.satisfied ? "Uploaded" : "Not provided"}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>


          <section className="lg:col-span-3 rounded-lg border bg-surface p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Upload files</h2>
                <p className="mt-2 text-sm text-fg-muted">
                  Choosing files uploads them straight away. File type is detected
                  automatically — if one is labelled wrongly, correct it on the document
                  itself below.
                </p>
              </div>
              <button
                type="button"
                disabled={!creditCase || refreshingUploads}
                onClick={refreshUploads}
                className="rounded-md border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-subtle disabled:opacity-60"
              >
                {refreshingUploads ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            <div className="mt-4">
              <FileUploadField
                multiple
                // Keyed on the case so an upload still in flight is still reported as
                // running after navigating away and back.
                scope={creditCase?.url}
                disabled={!creditCase || !customer}
                onUpload={handleUpload}
                onBackgroundUploadsSettled={() => {
                  if (creditCase) void reloadCaseAndUploads(creditCase);
                }}
              />
            </div>

            <div className="mt-4">
              <DocumentList
                documents={uploads}
                fileTypes={fileTypes}
                savingUrl={savingFileTypeUrl}
                renamingUrl={renamingUrl}
                onChangeFileType={(doc, key) => void handleChangeFileType(doc, key)}
                onRename={(doc, name) => void handleRenameDocument(doc, name)}
                onDelete={setDocumentToDelete}
              />
            </div>
          </section>
        </div>
      </RequireAuth>
    </AppShell>
  );
}
