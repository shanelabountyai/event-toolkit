import type { Metadata } from "next";
import { CalibrationView } from "./_components/CalibrationView";

export const metadata: Metadata = {
  title: "Calibration — Event Planner Suite",
  description: "What the recorded data says about the suite's documented default assumptions.",
};

export default function CalibrationPage() {
  return <CalibrationView />;
}
