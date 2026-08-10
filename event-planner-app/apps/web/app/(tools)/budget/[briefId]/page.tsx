import type { Metadata } from "next";
import { BudgetView } from "../_components/BudgetView";

export const metadata: Metadata = { title: "Budget — Budget Builder & Tracker" };

export default async function BudgetDetailPage({
  params,
}: {
  params: Promise<{ briefId: string }>;
}) {
  const { briefId } = await params;
  return <BudgetView briefId={briefId} />;
}
