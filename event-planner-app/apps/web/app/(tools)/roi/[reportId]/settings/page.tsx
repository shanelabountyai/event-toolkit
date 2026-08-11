import type { Metadata } from "next";
import { RoiPage } from "../../_components/RoiPage";

export const metadata: Metadata = { title: "Attribution settings — Event ROI" };

export default async function Page({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  return <RoiPage reportId={reportId} tab="settings" />;
}
