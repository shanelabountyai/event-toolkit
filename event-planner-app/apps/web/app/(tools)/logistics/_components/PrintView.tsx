"use client";

/** Client container for both print routes: the whole pack, or one artifact. */

import { PRINT_ARTIFACTS, PRINT_ARTIFACT_LABELS, type PrintArtifact } from "@event-toolkit/logistics";
import { useLogisticsPack } from "../_hooks/useLogisticsPack";
import { PackLoading, PackNotFound } from "./PackShell";
import { PrintLayout } from "./PrintLayout";
import { PrintArtifactSection } from "./PrintPack";

export function PrintView({
  packId,
  artifact,
}: {
  packId: string;
  /** Omitted for the full pack. */
  artifact?: PrintArtifact;
}) {
  const { pack, brief, loading, notFound } = useLogisticsPack(packId);

  if (loading) return <PackLoading />;
  if (notFound || !pack) return <PackNotFound />;

  const sections = artifact ? [artifact] : [...PRINT_ARTIFACTS];

  return (
    <PrintLayout
      pack={pack}
      brief={brief}
      title={artifact ? PRINT_ARTIFACT_LABELS[artifact] : "Full logistics pack"}
    >
      {sections.map((section) => (
        <PrintArtifactSection key={section} pack={pack} artifact={section} />
      ))}
    </PrintLayout>
  );
}
