import type { Metadata } from "next";
import { TriagePage } from "../../_components/TriagePage";

export const metadata: Metadata = { title: "Merge review — Lead Triage" };

export default async function Page({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <TriagePage sessionId={sessionId} tab="merge-review" />;
}
