"use client";
import { useEffect } from "react";
import { loadPrefs } from "@/lib/client/local";

export function applyTheme(theme: "system" | "light" | "dark") {
  const el = document.documentElement;
  if (theme === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", theme);
}

export function ThemeApplier() {
  useEffect(() => applyTheme(loadPrefs().theme), []);
  return null;
}
