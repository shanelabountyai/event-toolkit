import type { Metadata } from "next";
import { BudgetList } from "./_components/BudgetList";

export const metadata: Metadata = {
  title: "Budget Builder & Tracker — Event Planner Suite",
  description: "Line-item budgets with committed/actual tracking, variance flags and finance export.",
};

export default function BudgetIndexPage() {
  return <BudgetList />;
}
