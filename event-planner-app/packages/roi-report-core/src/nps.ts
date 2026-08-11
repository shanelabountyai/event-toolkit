// packages/roi-report-core/src/nps.ts
//
// FR-7 — NPS the standard way: %promoters (9-10) minus %detractors (0-6), passives (7-8)
// counted in the denominator but scoring nothing. Below five scored responses the number is
// flagged as a small sample rather than presented as fact.

import type { SurveyResponse, SurveySummary } from "./types";

export const NPS_SMALL_SAMPLE_THRESHOLD = 5;

export function computeSurveySummary(responses: SurveyResponse[]): SurveySummary {
  const scored = responses.filter(
    (r) => typeof r.npsScore === "number" && r.npsScore !== null && r.npsScore >= 0 && r.npsScore <= 10,
  );

  let npsScore: number | null = null;
  if (scored.length > 0) {
    const promoters = scored.filter((r) => (r.npsScore ?? 0) >= 9).length;
    const detractors = scored.filter((r) => (r.npsScore ?? 0) <= 6).length;
    npsScore = Math.round(((promoters - detractors) / scored.length) * 100);
  }

  const csatValues = responses
    .map((r) => r.csatScore)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  return {
    responseCount: responses.length,
    npsScore,
    npsSmallSample: scored.length > 0 && scored.length < NPS_SMALL_SAMPLE_THRESHOLD,
    csatAverage:
      csatValues.length === 0
        ? null
        : Math.round((csatValues.reduce((a, b) => a + b, 0) / csatValues.length) * 100) / 100,
  };
}
