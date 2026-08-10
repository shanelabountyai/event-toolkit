import type { Metadata } from "next";
import { BriefView } from "../_components/BriefView";

export const metadata: Metadata = {
  title: "Event brief — Event Planner Suite",
  description: "Structured event brief: objectives, audience, budget, RACI, metrics, risks and timeline.",
};

/** FR-5 / FR-8 / FR-10 / FR-12 — the brief view/edit screen. */
export default async function BriefDetailPage({
  params,
}: {
  params: Promise<{ briefId: string }>;
}) {
  const { briefId } = await params;
  return <BriefView briefId={briefId} />;
}
