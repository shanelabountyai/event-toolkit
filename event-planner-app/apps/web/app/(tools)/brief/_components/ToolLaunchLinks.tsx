"use client";

/**
 * "Launch a tool from this brief" (UX flow step 9).
 *
 * PRDs 2–7 are not built in this session, so these are deliberately non-navigating,
 * clearly-labelled "coming soon" entries. Clicking one still logs `tool_launch_from_brief`
 * with the target tool and `briefId` (FR-13) — that log is what powers PRD §10's
 * "% of downstream tools launched from a brief" metric once those routes exist.
 */

import { useState } from "react";
import type { EventBrief } from "@event-toolkit/schema";
import { logUsageEvent } from "@event-toolkit/local-store";
import { Badge, Card, CardBody, CardHeader } from "@event-toolkit/ui";
import { DOWNSTREAM_TOOLS } from "@/lib/tools";

export function ToolLaunchLinks({ brief }: { brief: EventBrief }) {
  const [clicked, setClicked] = useState<string | null>(null);

  const onClick = async (toolKey: string, toolName: string, href: string) => {
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
          <h2 className="text-base font-semibold text-slate-900">Launch a tool from this brief</h2>
          <p className="text-xs text-slate-500">
            The rest of the suite reads this brief instead of starting cold. These land in a
            later release — clicking still records interest in the local usage log.
          </p>
        </div>
      </CardHeader>
      <CardBody>
        <ul className="grid gap-2 sm:grid-cols-2">
          {DOWNSTREAM_TOOLS.map((tool) => (
            <li key={tool.key}>
              <button
                type="button"
                onClick={() => void onClick(tool.key, tool.name, tool.href)}
                aria-disabled="true"
                title={`${tool.name} — coming soon (PRD ${tool.prd})`}
                className="flex w-full cursor-not-allowed items-start justify-between gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-left hover:border-slate-400"
              >
                <span>
                  <span className="block text-sm font-medium text-slate-600">{tool.name}</span>
                  <span className="block text-xs text-slate-500">{tool.description}</span>
                </span>
                <Badge tone={clicked === tool.key ? "info" : "neutral"}>
                  {clicked === tool.key ? "Logged" : "Coming soon"}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
