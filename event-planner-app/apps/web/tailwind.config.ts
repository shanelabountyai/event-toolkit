import type { Config } from "tailwindcss";

/**
 * Semantic colours only.
 *
 * Tailwind's own palette (`slate-500`, `indigo-600`, …) stays available for one-off cases, but
 * everything structural should use the names below. They resolve to CSS custom properties defined
 * in `app/tokens.css`, which is what makes the dark theme a redefinition of ten values instead of
 * a second copy of every component.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    // Shared UI primitives live outside this app, so Tailwind must scan them too.
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        canvas: "var(--color-canvas)",
        surface: {
          DEFAULT: "var(--color-surface)",
          sunken: "var(--color-surface-sunken)",
          hover: "var(--color-surface-hover)",
        },
        content: {
          DEFAULT: "var(--color-text)",
          muted: "var(--color-text-muted)",
          subtle: "var(--color-text-subtle)",
          inverse: "var(--color-text-inverse)",
        },
        line: {
          DEFAULT: "var(--color-border)",
          strong: "var(--color-border-strong)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          hover: "var(--color-accent-hover)",
          fg: "var(--color-accent-fg)",
          subtle: "var(--color-accent-subtle)",
          text: "var(--color-accent-text)",
        },
        danger: {
          DEFAULT: "var(--color-danger)",
          text: "var(--color-danger-text)",
          subtle: "var(--color-danger-subtle)",
          border: "var(--color-danger-border)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          text: "var(--color-warning-text)",
          subtle: "var(--color-warning-subtle)",
          border: "var(--color-warning-border)",
        },
        success: {
          DEFAULT: "var(--color-success)",
          text: "var(--color-success-text)",
          subtle: "var(--color-success-subtle)",
          border: "var(--color-success-border)",
        },
        focus: "var(--color-focus)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow-md)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      borderColor: {
        DEFAULT: "var(--color-border)",
      },
    },
  },
  plugins: [],
};

export default config;
