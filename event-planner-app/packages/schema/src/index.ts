/**
 * @event-toolkit/schema — public API.
 *
 * The canonical Event Brief contract for the whole suite. Pure TypeScript: no React, no
 * Next, no DOM APIs beyond `crypto.randomUUID()`. Every tool (PRDs 1–7) imports its types
 * and helpers from here and never redefines them locally.
 */

export * from "./event-brief";
export * from "./ids";
export * from "./presets";
export * from "./defaults";
export * from "./validation";
export * from "./completeness";
export * from "./promo-kit";
export * from "./promo-kit-templates";
export { migrateBrief, MIGRATIONS, type MigrationStep } from "./migrations";
