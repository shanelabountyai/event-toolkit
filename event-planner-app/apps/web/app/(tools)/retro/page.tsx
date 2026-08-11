import { Suspense } from "react";
import type { Metadata } from "next";
import { RetroList } from "./_components/RetroList";

export const metadata: Metadata = {
  title: "Post-Mortem — Event Planner Suite",
  description: "Turn what happened into lessons the next event's brief starts with.",
};

export default function RetroIndexPage() {
  return (
    <Suspense fallback={<p className="py-16 text-center text-sm text-slate-500">Loading…</p>}>
      <RetroList />
    </Suspense>
  );
}
