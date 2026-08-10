import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PRINT_ARTIFACTS, type PrintArtifact } from "@event-toolkit/logistics";
import { PrintView } from "../../../_components/PrintView";

export const metadata: Metadata = { title: "Print — Logistics Pack" };

export default async function Page({
  params,
}: {
  params: Promise<{ packId: string; artifact: string }>;
}) {
  const { packId, artifact } = await params;
  if (!PRINT_ARTIFACTS.includes(artifact as PrintArtifact)) notFound();
  return <PrintView packId={packId} artifact={artifact as PrintArtifact} />;
}
