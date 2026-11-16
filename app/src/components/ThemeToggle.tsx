"use client";

import { applyTheme, readTheme } from "@/lib/theme";

export default function ThemeToggle() {
  return (
    <button
      type="button"
      className="btn btn-secondary px-3"
      aria-label="Toggle color theme"
      onClick={() => applyTheme(readTheme() === "dark" ? "light" : "dark")}
    >
      <span className="theme-label-light">Dark</span>
      <span className="theme-label-dark">Light</span>
    </button>
  );
}
