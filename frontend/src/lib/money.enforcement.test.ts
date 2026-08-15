/**
 * Guards the rule that all money goes through `<Money>` and `<MoneyInput>`.
 *
 * Everything else about money is a convention until something enforces it — and a
 * convention is exactly what failed here before: the dashboard formatted its amounts
 * while the detail page rendered `1500000.00` raw, because each call site decided for
 * itself. This test scans the source and fails when a new site starts doing that again.
 *
 * A source scan rather than a lint rule on purpose: it needs no new tooling, runs in the
 * suite everyone already runs, and the failure message can say what to do instead. If
 * money spreads to many more fields, promote this to a real ESLint rule.
 *
 * WHEN THIS FAILS: don't add your file to the allow-lists. Use `<Money>` to display an
 * amount and `<MoneyInput>` to edit one. The allow-lists are for the money plumbing
 * itself.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC = join(process.cwd(), "src");

/** Every hand-written source file, excluding tests and generated output. */
function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(entry)) return [];
    if (entry.includes(".test.")) return [];
    if (entry === "api.generated.ts") return [];
    return [full];
  });
}

/** Repo-relative, forward-slashed, so the allow-lists read the same on any platform. */
function rel(file: string): string {
  return relative(process.cwd(), file).split(sep).join("/");
}

const FILES = sourceFiles().map((file) => ({
  path: rel(file),
  text: readFileSync(file, "utf8"),
}));

describe("money formatting is centralised", () => {
  it("finds source files to scan", () => {
    // A broken walk would make every test below pass vacuously.
    expect(FILES.length).toBeGreaterThan(15);
  });

  it("only formats money inside the Money component", () => {
    // `formatMoney` is the low-level formatter; pages should render <Money> instead, so
    // that currency handling, locale and alignment stay in one place.
    const allowed = ["src/components/Money.tsx", "src/lib/format.ts"];

    const offenders = FILES.filter(
      (f) => !allowed.includes(f.path) && f.text.includes("formatMoney"),
    ).map((f) => f.path);

    expect(
      offenders,
      `These files call formatMoney directly. Render <Money value={…} currency={…} /> instead:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("only builds a money Intl formatter inside lib/money and lib/format", () => {
    const allowed = ["src/lib/money.ts", "src/lib/format.ts"];

    const offenders = FILES.filter(
      (f) =>
        !allowed.includes(f.path) &&
        /Intl\.NumberFormat/.test(f.text) &&
        /currency|minimumFractionDigits/.test(f.text),
    ).map((f) => f.path);

    expect(
      offenders,
      `These files format numbers as money themselves. Use lib/money.ts:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("only hand-rolls a decimal input inside MoneyInput", () => {
    // `inputMode="decimal"` is the fingerprint of someone building a money field by
    // hand — which is how the detail page ended up with an unformatted amount box.
    const allowed = ["src/components/MoneyInput.tsx"];

    const offenders = FILES.filter(
      (f) => !allowed.includes(f.path) && f.text.includes('inputMode="decimal"'),
    ).map((f) => f.path);

    expect(
      offenders,
      `These files hand-roll a decimal input. Use <MoneyInput value={…} onChange={…} /> instead:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("never renders a raw amount field into JSX", () => {
    // e.g. `{cc.requested_amount}` or `{creditCase.requested_amount ?? "—"}`.
    const rawAmountInJsx = /\{[^{}]*\.requested_amount[^{}]*\}/;
    const allowed = ["src/components/Money.tsx"];

    const offenders = FILES.filter((f) => {
      if (allowed.includes(f.path)) return false;
      // Only .tsx files render JSX; a .ts file mentioning the field is data handling.
      if (!f.path.endsWith(".tsx")) return false;
      return f.text
        .split("\n")
        .some(
          (line) =>
            rawAmountInJsx.test(line) &&
            // Passing it INTO a component is the correct thing to do.
            !/value=|amount=|<Money|MoneyInput/.test(line),
        );
    }).map((f) => f.path);

    expect(
      offenders,
      `These files interpolate a raw amount into JSX. Render <Money value={…} /> instead:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("keeps the number-formatting locale defined in exactly one place", () => {
    // `localeCompare` is deliberately exempt: sorting text by Spanish collation rules is
    // a separate concern from formatting an amount, and those call sites are not money.
    const offenders = FILES.filter((f) => {
      if (f.path === "src/lib/money.ts") return false;
      return f.text
        .split("\n")
        .some((line) => line.includes('"es-MX"') && !line.includes("localeCompare"));
    }).map((f) => f.path);

    expect(
      offenders,
      `The number-formatting locale belongs to lib/money.ts (MONEY_LOCALE). Found a hardcoded copy in:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
