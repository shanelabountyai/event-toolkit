"use client";

/**
 * Entry screen before a kit exists: what will be generated, and either a Generate button or
 * a specific, actionable reason it is blocked.
 */

import Link from "next/link";
import type { EventBrief } from "@event-toolkit/schema";
import { EXPECTED_ASSET_COUNT, missingFieldsForGeneration } from "@event-toolkit/schema";
import { Button, Card, CardBody, CardFooter, CardHeader } from "@event-toolkit/ui";

const BREAKDOWN = [
  { label: "Landing page", detail: "Headline, why-attend, takeaways, logistics and CTA.", count: 1 },
  { label: "Email sequence", detail: "Invite, two reminders, last chance and day-of — with suggested send dates.", count: 5 },
  { label: "Social posts", detail: "LinkedIn, X and Facebook, each written for the channel, at three campaign stages.", count: 9 },
  { label: "Sales outreach", detail: "Personal email snippet, LinkedIn DM and a call/voicemail script.", count: 3 },
];

export function PromoKitHome({
  brief,
  generating,
  onGenerate,
}: {
  brief: EventBrief;
  generating: boolean;
  onGenerate: () => void;
}) {
  const missing = missingFieldsForGeneration(brief);
  const blocked = missing.length > 0;

  return (
    <Card>
      <CardHeader>
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Generate {EXPECTED_ASSET_COUNT} promo assets from this brief
          </h2>
          <p className="text-xs text-slate-500">
            Written from the brief you already filled in — no AI call, nothing leaves this browser.
          </p>
        </div>
      </CardHeader>

      <CardBody>
        <ul className="grid gap-3 sm:grid-cols-2">
          {BREAKDOWN.map((item) => (
            <li key={item.label} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <p className="text-sm font-medium text-slate-900">
                {item.count} × {item.label}
              </p>
              <p className="mt-0.5 text-xs text-slate-600">{item.detail}</p>
            </li>
          ))}
        </ul>

        {blocked ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-medium text-amber-900">
              This brief is missing {missing.length === 1 ? "a field" : "fields"} the copy needs:
            </p>
            <ul className="mt-1.5 list-inside list-disc text-sm text-amber-900">
              {missing.map((f) => (
                <li key={f.path}>{f.label}</li>
              ))}
            </ul>
            <Link
              href={`/brief/${brief.id}`}
              className="mt-2 inline-block text-sm font-medium text-amber-900 underline underline-offset-4"
            >
              Fill {missing.length === 1 ? "it" : "them"} in on the brief →
            </Link>
          </div>
        ) : null}
      </CardBody>

      <CardFooter className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          You can edit every asset afterwards — edits are kept when you regenerate.
        </p>
        <Button variant="primary" disabled={blocked || generating} onClick={onGenerate}>
          {generating ? "Generating…" : "Generate promo kit"}
        </Button>
      </CardFooter>
    </Card>
  );
}
