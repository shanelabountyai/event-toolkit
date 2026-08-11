import type { Metadata } from "next";
import { ReportList } from "./_components/ReportList";

export const metadata: Metadata = {
  title: "Event ROI & Attribution — Event Planner Suite",
  description: "Budget, pipeline, leads and sentiment in one defensible post-event report.",
};

export default function RoiIndexPage() {
  return <ReportList />;
}
