import type { Metadata } from "next";
import { RetroPage } from "../_components/RetroPage";

export const metadata: Metadata = { title: "Post-mortem — Event Planner Suite" };

export default async function Page({ params }: { params: Promise<{ retroId: string }> }) {
  const { retroId } = await params;
  return <RetroPage retroId={retroId} />;
}
