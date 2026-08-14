"use client";

import { useEffect, useState } from "react";
import { applyPreference, readPreference, type ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; hint: string }[] = [
  { value: "light", label: "Light", hint: "Always light" },
  { value: "system", label: "Auto", hint: "Follow this device" },
  { value: "dark", label: "Dark", hint: "Always dark" },
];

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setPreference(readPreference());
    setMounted(true);
  }, []);

  // When following the OS, follow it as it changes rather than only at page load.
  useEffect(() => {
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyPreference("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  function choose(value: ThemePreference) {
    setPreference(value);
    applyPreference(value);
  }

  // Renders a stable placeholder until mounted: the server cannot know the preference, and
  // rendering the wrong one first is a hydration mismatch and a visible flicker.
  if (!mounted) return <div className="h-7 w-[7.5rem]" aria-hidden />;

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="inline-flex rounded-lg bg-surface-sunken p-0.5 ring-1 ring-inset ring-line"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={preference === option.value}
          title={option.hint}
          onClick={() => choose(option.value)}
          className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            preference === option.value
              ? "bg-surface text-content shadow-sm"
              : "text-content-subtle hover:text-content"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
