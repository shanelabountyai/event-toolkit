import type { Metadata } from "next";
import { BriefList } from "./_components/BriefList";

export const metadata: Metadata = {
  title: "Event Briefs — Event Planner Suite",
  description: "All event briefs stored locally in this browser.",
};

/** FR-7 — the Event Brief Generator's home: the list of locally stored briefs. */
export default function BriefListPage() {
  return <BriefList />;
}
