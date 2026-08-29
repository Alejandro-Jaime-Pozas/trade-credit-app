/**
 * A section-level notice that some values here were produced by AI.
 *
 * Placed once per form/section rather than per field on purpose: repeating a caveat on
 * every input is noise a user learns to skip, and it also implies the untouched fields
 * are somehow different. One notice at the top of the section states the situation and
 * stays readable.
 *
 * Deliberately plain italic text, no color/border/icon: this is informational, not a
 * warning, so it shouldn't compete visually with actual errors or draw the eye.
 *
 * Used wherever GPT writes into what the user sees — extracted customer details, and
 * the file type it assigns to an uploaded document.
 */
export function AiNotice({ className = "" }: { className?: string }) {
  return (
    <p className={["text-xs italic text-fg-subtle", className].join(" ")}>
      AI can make mistakes, make sure the data created is accurate.
    </p>
  );
}
