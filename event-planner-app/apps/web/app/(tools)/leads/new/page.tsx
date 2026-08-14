import { Suspense } from "react";
import type { Metadata } from "next";
import { NewSessionForm } from "../_components/NewSessionForm";

export const metadata: Metadata = { title: "New triage session — Lead Triage" };

export default function NewTriageSessionPage() {
  return (
    <Suspense fallback={<p className="py-16 text-center text-sm text-content-muted">Loading…</p>}>
      <NewSessionForm />
    </Suspense>
  );
}
