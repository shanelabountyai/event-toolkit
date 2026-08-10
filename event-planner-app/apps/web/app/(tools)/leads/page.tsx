import type { Metadata } from "next";
import { SessionList } from "./_components/SessionList";

export const metadata: Metadata = {
  title: "Lead Triage & Follow-Up — Event Planner Suite",
  description: "Dedupe, score, route and draft follow-ups for event leads.",
};

export default function LeadsIndexPage() {
  return <SessionList />;
}
