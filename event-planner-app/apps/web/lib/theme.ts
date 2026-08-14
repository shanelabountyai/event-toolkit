// apps/web/lib/theme.ts
//
// Theme preference: follow the operating system unless the person has said otherwise for this app.
//
// "System" is a real, storable choice rather than the absence of one, so somebody who has
// deliberately chosen to follow their OS keeps following it when they change it later.

export type ThemePreference = "light" | "dark" | "system";

const KEY = "event-toolkit:theme";

export function readPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

export function prefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolve(preference: ThemePreference): "light" | "dark" {
  return preference === "system" ? (prefersDark() ? "dark" : "light") : preference;
}

export function applyPreference(preference: ThemePreference): void {
  const dark = resolve(preference) === "dark";
  document.documentElement.classList.toggle("dark", dark);
  // Tells the browser to render form controls, scrollbars and the like in the matching scheme.
  // Without it a dark page keeps white scrollbars and a blinding date picker.
  document.documentElement.style.colorScheme = dark ? "dark" : "light";

  try {
    if (preference === "system") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, preference);
  } catch {
    /* Private browsing. The choice applies for this page load and is not remembered. */
  }
}
