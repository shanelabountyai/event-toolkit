import { Suspense } from "react";
import type { Metadata } from "next";
import { LogisticsEntry } from "./_components/LogisticsEntry";

export const metadata: Metadata = {
  title: "Logistics Pack — Event Planner Suite",
  description: "Run of show, staffing, shipping, venue checklist and on-site contacts.",
};

export default function LogisticsIndexPage() {
  return (
    <Suspense fallback={<p className="py-16 text-center text-sm text-slate-500">Loading…</p>}>
      <LogisticsEntry />
    </Suspense>
  );
}
