import type { Metadata } from "next";
import { RoiPage } from "../../_components/RoiPage";

export const metadata: Metadata = { title: "Year over year — Event ROI" };

export default async function Page({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  return <RoiPage reportId={reportId} tab="yoy" />;
}
