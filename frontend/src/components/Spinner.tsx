/**
 * A small spinning ring, for anything the user has to wait on.
 *
 * Purely decorative — `aria-hidden`, because the surrounding text ("Uploading…",
 * "Pending AI verdict") is what a screen reader should announce, not the animation.
 * `animate-spin` and `border-t-transparent` together make one side of the ring
 * invisible, which is what reads as rotation.
 */
export function Spinner({
  className = "",
  size = 14,
}: {
  className?: string;
  /** Diameter in px. Defaults to roughly the height of a line of small text. */
  size?: number;
}) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={[
        "inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      ].join(" ")}
    />
  );
}
