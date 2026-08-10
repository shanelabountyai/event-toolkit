import type { Metadata } from "next";
import { PresetPicker } from "../_components/PresetPicker";

export const metadata: Metadata = {
  title: "New brief — Event Planner Suite",
  description: "Choose an event-type preset to start a new brief.",
};

/** FR-1 — step 1 of the flow: choose an event-type preset. */
export default function NewBriefPage() {
  return <PresetPicker />;
}
