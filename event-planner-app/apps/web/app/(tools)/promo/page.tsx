import { Suspense } from "react";
import type { Metadata } from "next";
import { PromoLanding } from "./_components/PromoLanding";

export const metadata: Metadata = {
  title: "Promo Campaign Kit — Event Planner Suite",
  description: "Generate landing page, email, social and sales copy from an event brief.",
};

export default function PromoIndexPage() {
  return (
    <Suspense fallback={<p className="py-16 text-center text-sm text-slate-500">Loading…</p>}>
      <PromoLanding />
    </Suspense>
  );
}
