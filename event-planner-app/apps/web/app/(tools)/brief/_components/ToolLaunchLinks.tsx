"use client";

/**
 * "Launch a tool from this brief" (UX flow step 9).
 *
 * Built tools are real links carrying `?briefId=`; the rest stay deliberately non-navigating
 * "coming soon" entries. Either way the click logs `tool_launch_from_brief` with the target
 * tool and `briefId` (FR-13) — that log is what powers PRD §10's "% of downstream tools
 * launched from a brief" metric.
 */

import { useState } from "react";
import Link from "next/link";
import type { EventBrief } from "@event-toolkit/schema";
import { logUsageEvent } from "@event-toolkit/local-store";
import { Badge, Card, CardBody, CardHeader } from "@event-toolkit/ui";
import { DOWNSTREAM_TOOLS } from "@/lib/tools";

export function ToolLaunchLinks({ brief }: { brief: EventBrief }) {
  const [clicked, setClicked] = useState<string | null>(null);

  const log = async (toolKey: string, toolName: string, href: string) => {
    setClicked(toolKey);
    await logUsageEvent({
      type: "tool_launch_from_brief",
      briefId: brief.id,
      briefName: brief.name || "Untitled brief",
      details: { targetTool: toolKey, targetHref: `${href}?briefId=${brief.id}`, toolName },
    });
  };

  return (
    <Card className="no-print">
      <CardHeader>
        <div>
          <h2 className="text-base font-semibold text-content">Launch a tool from this brief</h2>
          <p className="text-xs text-content-muted">
            The rest of the suite reads this brief instead of starting cold. Tools still in build
            record interest in the local usage log when clicked.
          </p>
        </div>
      </CardHeader>
      <CardBody>
        <ul className="grid gap-2 sm:grid-cols-2">
          {DOWNSTREAM_TOOLS.map((tool) =>
            tool.available ? (
              <li key={tool.key}>
                <Link
                  href={`${tool.href}?briefId=${brief.id}`}
                  onClick={() => void log(tool.key, tool.name, tool.href)}
                  className="flex w-full items-start justify-between gap-3 rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-left hover:border-line-strong hover:bg-surface-sunken"
                >
                  <span>
                    <span className="block text-sm font-medium text-content">{tool.name}</span>
                    <span className="block text-xs text-content-muted">{tool.description}</span>
                  </span>
                  <Badge tone="success">Open</Badge>
                </Link>
              </li>
            ) : (
              <li key={tool.key}>
                <button
                  type="button"
                  onClick={() => void log(tool.key, tool.name, tool.href)}
                  aria-disabled="true"
                  title={`${tool.name} — coming soon (PRD ${tool.prd})`}
                  className="flex w-full cursor-not-allowed items-start justify-between gap-3 rounded-lg border border-dashed border-line-strong bg-surface-sunken px-3 py-2.5 text-left hover:border-line-strong"
                >
                  <span>
                    <span className="block text-sm font-medium text-content-muted">{tool.name}</span>
                    <span className="block text-xs text-content-muted">{tool.description}</span>
                  </span>
                  <Badge tone={clicked === tool.key ? "info" : "neutral"}>
                    {clicked === tool.key ? "Logged" : "Coming soon"}
                  </Badge>
                </button>
              </li>
            ),
          )}
        </ul>
      </CardBody>
    </Card>
  );
}
