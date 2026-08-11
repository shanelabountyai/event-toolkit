/**
 * @event-toolkit/access — the permission model for PRD 8.
 *
 * Pure TypeScript: no React, no Next, no database. Everything a tool needs to answer "may this
 * person do this" lives here, so the answer is given in one place and can be exhaustively
 * tested — including the negative cases, which are the ones that matter.
 */

export * from "./roles";
export * from "./capabilities";
export * from "./can";
