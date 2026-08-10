import type { Metadata } from "next";
import { IntakeWizard } from "../../_components/IntakeWizard";

export const metadata: Metadata = {
  title: "Guided intake — Event Planner Suite",
  description: "Six-step guided intake that assembles a complete event brief.",
};

/** FR-2 — the guided intake wizard for one brief. */
export default async function IntakePage({
  params,
}: {
  params: Promise<{ briefId: string }>;
}) {
  const { briefId } = await params;
  return <IntakeWizard briefId={briefId} />;
}
