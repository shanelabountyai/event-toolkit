"use client";

import {
  EVENT_TYPE_LABELS,
  type BriefStatus,
  type EventType,
  type LikertLevel,
} from "@event-toolkit/schema";
import { Badge } from "@event-toolkit/ui";

export function TypeBadge({ type }: { type: EventType }) {
  return <Badge tone="info">{EVENT_TYPE_LABELS[type]}</Badge>;
}

export function StatusBadge({ status }: { status: BriefStatus }) {
  return (
    <Badge tone={status === "complete" ? "success" : "neutral"}>
      {status === "complete" ? "Complete" : "Draft"}
    </Badge>
  );
}

export function LikertBadge({ level, label }: { level: LikertLevel; label?: string }) {
  const tone = level === "high" ? "danger" : level === "medium" ? "warning" : "neutral";
  return (
    <Badge tone={tone}>
      {label ? `${label}: ` : ""}
      {level}
    </Badge>
  );
}
