// Auth.js route handler.
//
// Node runtime, not edge: the Postgres driver and the session adapter do not run on edge.
export const runtime = "nodejs";
// Sessions are per-request state; caching this route would serve one person's session to another.
export const dynamic = "force-dynamic";

import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
