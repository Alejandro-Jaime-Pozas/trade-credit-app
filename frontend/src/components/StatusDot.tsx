/**
 * A small coloured dot showing where a credit case stands, at a glance.
 *
 * Colour carries meaning here, so it is never the ONLY signal: the dot always sits
 * beside the status text, and carries its own `title`/`aria-label` for anyone who
 * can't distinguish the colours.
 *
 * "Pending AI verdict" is the one status that means work is actively happening rather
 * than waiting on a person, so it renders as a spinner instead of a static dot.
 */
import { Spinner } from "./Spinner";
import { CREDIT_CASE_STATUS_LABELS } from "@/lib/constants";

/**
 * Tailwind background class per status. Anything unrecognised falls back to grey.
 *
 * These are the one place in the app that still names raw palette colours instead of
 * design tokens, on purpose: they are signal colours (green = good, red = rejected)
 * rather than surfaces, they carry the same meaning in light and dark mode, and a
 * saturated 500-weight dot reads clearly against both the white and the near-black
 * background.
 */
const STATUS_DOT_COLORS: Record<string, string> = {
  complete: "bg-green-500",
  missing_documents: "bg-orange-500",
  buro_de_credito_rejected: "bg-red-500",
  pending_final_verdict: "bg-yellow-400",
};

export function StatusDot({ status }: { status: string | null | undefined }) {
  if (!status) return null;

  const label = CREDIT_CASE_STATUS_LABELS[status] ?? status;

  if (status === "pending_ai_verdict") {
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        className="inline-flex text-fg-faint"
      >
        <Spinner size={10} />
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={[
        "inline-block h-2.5 w-2.5 shrink-0 rounded-full",
        STATUS_DOT_COLORS[status] ?? "bg-zinc-300",
      ].join(" ")}
    />
  );
}

/**
 * The status text with its dot, as shown in table cells and on the detail page.
 *
 * Dot first, close to the text: it reads as a marker on the status rather than as a
 * separate column of its own, and keeps the dots aligned down the table. The gap is
 * deliberately small — just enough to separate the two, not enough to detach them.
 */
export function StatusWithDot({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-fg-muted">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <StatusDot status={status} />
      <span>{CREDIT_CASE_STATUS_LABELS[status] ?? status}</span>
    </span>
  );
}
