import { Suspense } from "react";
import type { Metadata } from "next";
import { PromoKitView } from "../_components/PromoKitView";

export const metadata: Metadata = {
  title: "Campaign kit — Promo Campaign Kit",
  description: "Landing page, email sequence, social posts and sales outreach for one event.",
};

export default function PromoKitPage() {
  return (
    <Suspense fallback={<p className="py-16 text-center text-sm text-slate-500">Loading…</p>}>
      <PromoKitView />
    </Suspense>
  );
}
