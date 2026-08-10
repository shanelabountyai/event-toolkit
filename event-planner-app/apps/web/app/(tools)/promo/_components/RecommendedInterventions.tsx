"use client";

/**
 * Rule-based tactics, shown only when registrations are behind pace.
 *
 * Each tactic links straight to the kit asset that carries it out, so "send the last-chance
 * email" lands on the actual last-chance email rather than the top of the kit.
 */

import Link from "next/link";
import type { Intervention, PromoAsset } from "@event-toolkit/schema";
import { Card, CardBody, CardHeader } from "@event-toolkit/ui";

/** Resolve a tactic to a concrete asset in this brief's kit, if one matches. */
function matchAsset(intervention: Intervention, assets: PromoAsset[]): PromoAsset | null {
  if (!intervention.assetType) return null;
  const candidates = assets.filter((a) => a.type === intervention.assetType);
  if (candidates.length === 0) return null;
  if (!intervention.assetSubtype) return candidates[0];
  return candidates.find((a) => a.subtype === intervention.assetSubtype) ?? null;
}

export function RecommendedInterventions({
  interventions,
  assets,
  briefId,
}: {
  interventions: Intervention[];
  assets: PromoAsset[];
  briefId: string;
}) {
  if (interventions.length === 0) return null;

  return (
    <Card className="border-amber-200">
      <CardHeader className="border-amber-200 bg-amber-50/60">
        <div>
          <h2 className="text-base font-semibold text-amber-900">Recommended next steps</h2>
          <p className="text-xs text-amber-800">
            Registrations are behind the target curve. These are the levers still available, most
            urgent first.
          </p>
        </div>
      </CardHeader>
      <CardBody>
        <ol className="space-y-3">
          {interventions.map((item) => {
            const asset = matchAsset(item, assets);
            return (
              <li key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-sm font-medium text-slate-900">{item.title}</p>
                <p className="mt-0.5 text-sm text-slate-600">{item.detail}</p>
                {asset ? (
                  <Link
                    href={`/promo/kit?briefId=${briefId}#asset-${asset.id}`}
                    className="mt-1.5 inline-block text-sm font-medium text-slate-900 underline underline-offset-4 hover:text-slate-600"
                  >
                    Open “{asset.label}” →
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ol>
      </CardBody>
    </Card>
  );
}
