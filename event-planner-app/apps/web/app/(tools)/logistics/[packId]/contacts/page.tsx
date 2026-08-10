import type { Metadata } from "next";
import { ArtifactPage } from "../../_components/ArtifactPage";

export const metadata: Metadata = { title: "On-site contacts — Logistics Pack" };

export default async function Page({ params }: { params: Promise<{ packId: string }> }) {
  const { packId } = await params;
  return <ArtifactPage packId={packId} artifact="contacts" />;
}
