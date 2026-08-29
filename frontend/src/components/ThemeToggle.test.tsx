/**
 * Tests for the light/dark mode button (src/components/ThemeToggle.tsx).
 *
 * Covers what a user can actually observe: the button says what it will do, clicking it
 * switches the page, and the choice is remembered for the next visit.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "./ThemeToggle";
import { THEME_STORAGE_KEY } from "@/lib/theme";

/** jsdom has no `matchMedia`; this stands in for the OS light/dark setting. */
function stubSystemPreference(prefersDark: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: prefersDark,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "";
  localStorage.clear();
  stubSystemPreference(false);
});

describe("ThemeToggle", () => {
  it("offers to switch to dark mode while the page is light", () => {
    render(<ThemeToggle />);

    const button = screen.getByRole("button", { name: "Switch to dark mode" });
    // aria-pressed tells assistive tech this is a two-state control that is currently off.
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("switches the page to dark mode when clicked", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "Switch to dark mode" }));

    // The `dark` class on <html> is what every design token keys off.
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    // ...and the button now offers the trip back.
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("switches back to light mode on a second click", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    await user.click(screen.getByRole("button", { name: "Switch to light mode" }));

    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("remembers the choice so it survives a reload", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "Switch to dark mode" }));

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("shows the dark-mode state when the page loaded dark", () => {
    // The inline script in the root layout has already run by the time React mounts.
    document.documentElement.classList.add("dark");

    render(<ThemeToggle />);

    expect(
      screen.getByRole("button", { name: "Switch to light mode" }),
    ).toBeInTheDocument();
  });
});
