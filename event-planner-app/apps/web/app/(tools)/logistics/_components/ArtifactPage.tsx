"use client";

/**
 * One client container for all seven pack views.
 *
 * They differ only in which artifact they render inside the shared shell, so this switches on
 * a key rather than repeating the same load/shell/save wiring seven times.
 */

import type { RelatedArtifact } from "@event-toolkit/logistics";
import { useLogisticsPack } from "../_hooks/useLogisticsPack";
import { ArtifactHeader, PackLoading, PackNotFound, PackShell } from "./PackShell";
import { ChecklistView } from "./ChecklistView";
import { ContactSheetTable } from "./ContactSheetTable";
import { IssueLogView } from "./IssueLogView";
import { PackOverview } from "./PackOverview";
import { RunOfShowTable } from "./RunOfShowTable";
import { ShippingManifestTable } from "./ShippingManifestTable";
import { StaffingViews } from "./StaffingViews";

export type ArtifactKey =
  | "overview"
  | "run-of-show"
  | "staffing"
  | "shipping"
  | "checklist"
  | "contacts"
  | "issues";

const ARTIFACT_FOR_ISSUE: Record<ArtifactKey, RelatedArtifact> = {
  overview: "other",
  "run-of-show": "run_of_show",
  staffing: "staffing",
  shipping: "shipping",
  checklist: "checklist",
  contacts: "contacts",
  issues: "other",
};

const HEADINGS: Record<ArtifactKey, { title: string; description: string }> = {
  overview: { title: "Pack overview", description: "Where this pack stands, and what still needs filling in." },
  "run-of-show": {
    title: "Run of show",
    description: "The one place session times live — everything else in the pack derives from here.",
  },
  staffing: { title: "Staffing", description: "Who is covering what, by session or by person." },
  shipping: { title: "Shipping manifest", description: "What is going to the venue, and where it is now." },
  checklist: { title: "Venue checklist", description: "Grouped by category, with progress per group." },
  contacts: { title: "On-site contacts", description: "Who to call, grouped by internal, vendor and venue." },
  issues: { title: "Issue log", description: "Everything flagged during the event. The retro reads this later." },
};

export function ArtifactPage({ packId, artifact }: { packId: string; artifact: ArtifactKey }) {
  const { pack, brief, updatePack, saveState, loading, notFound, reloadBrief } =
    useLogisticsPack(packId);

  if (loading) return <PackLoading />;
  if (notFound || !pack) return <PackNotFound />;

  const heading = HEADINGS[artifact];

  return (
    <PackShell
      pack={pack}
      brief={brief}
      active={artifact === "overview" ? "" : artifact}
      artifact={ARTIFACT_FOR_ISSUE[artifact]}
      saveState={saveState}
      onUpdate={updatePack}
    >
      <div className="space-y-4">
        <ArtifactHeader title={heading.title} description={heading.description} />

        {artifact === "overview" ? (
          <PackOverview pack={pack} brief={brief} onBriefWritten={reloadBrief} />
        ) : null}

        {artifact === "run-of-show" ? (
          <RunOfShowTable
            pack={pack}
            eventStartDate={brief?.dates?.eventStartDate}
            onUpdate={updatePack}
          />
        ) : null}

        {artifact === "staffing" ? (
          <StaffingViews
            pack={pack}
            suggestedNames={(brief?.stakeholders ?? []).map((s) => s.name).filter(Boolean)}
            onUpdate={updatePack}
          />
        ) : null}

        {artifact === "shipping" ? (
          <ShippingManifestTable
            pack={pack}
            defaultShipTo={brief?.format?.venueOrPlatform?.locationOrUrl}
            onUpdate={updatePack}
          />
        ) : null}

        {artifact === "checklist" ? <ChecklistView pack={pack} onUpdate={updatePack} /> : null}
        {artifact === "contacts" ? <ContactSheetTable pack={pack} onUpdate={updatePack} /> : null}
        {artifact === "issues" ? <IssueLogView pack={pack} onUpdate={updatePack} /> : null}
      </div>
    </PackShell>
  );
}
