import type { Metadata } from "next";
import { PrintView } from "../../_components/PrintView";

export const metadata: Metadata = { title: "Print full pack — Logistics Pack" };

export default async function Page({ params }: { params: Promise<{ packId: string }> }) {
  const { packId } = await params;
  return <PrintView packId={packId} />;
}
