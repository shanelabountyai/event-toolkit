import { redirect } from "next/navigation";

/**
 * Suite home. For now the Event Brief Generator is the only implemented tool, so the root
 * route forwards to it (handoff §2). When PRDs 2–7 land this becomes a real suite dashboard.
 */
export default function HomePage() {
  redirect("/brief");
}
