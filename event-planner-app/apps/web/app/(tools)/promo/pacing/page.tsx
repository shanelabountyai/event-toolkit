import { Suspense } from "react";
import type { Metadata } from "next";
import { PacingView } from "../_components/PacingView";

export const metadata: Metadata = {
  title: "Registration pacing — Promo Campaign Kit",
  description: "Track registrations against a target curve and act before the event underperforms.",
};

export default function PromoPacingPage() {
  return (
    <Suspense fallback={<p className="py-16 text-center text-sm text-content-muted">Loading…</p>}>
      <PacingView />
    </Suspense>
  );
}
