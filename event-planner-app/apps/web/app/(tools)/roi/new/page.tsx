import type { Metadata } from "next";
import { ReportList } from "../_components/ReportList";

export const metadata: Metadata = { title: "New ROI report — Event ROI" };

export default function NewRoiReportPage() {
  return <ReportList startOnPicker />;
}
