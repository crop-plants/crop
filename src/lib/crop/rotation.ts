// Rotation rules (spec 6.6). Deterministic, each applied rule is returned so the
// explanation drawer can show exactly what happened.

import type { AppliedRule, CropDef } from "./types";

export interface RotationContext {
  /** chronologically ordered previously grown crops (most recent last) */
  history: CropDef[];
}

export function rotationScore(candidate: CropDef, ctx: RotationContext): { score: number; appliedRules: AppliedRule[] } {
  let score = 1.0;
  const applied: AppliedRule[] = [{ rule: "Start", effect: "Rotation score starts at 1.0" }];
  const hist = ctx.history;
  const prev = hist[hist.length - 1] ?? null;
  const twoBack = hist.length >= 2 ? hist[hist.length - 2] : null;
  const lastThree = hist.slice(-3);

  if (prev && prev.family === candidate.family) {
    score *= 0.2;
    applied.push({ rule: "Same family as previous season", effect: `×0.2 — ${candidate.family} grown in the previous season (${prev.name})` });
  }
  if (twoBack && twoBack.family === candidate.family) {
    score *= 0.6;
    applied.push({ rule: "Same family two seasons back", effect: `×0.6 — ${candidate.family} grown two seasons ago (${twoBack.name})` });
  }
  if (prev && prev.nitrogenRole === "fixer" && candidate.nitrogenRole === "heavy") {
    score = Math.min(1, score + 0.15);
    applied.push({ rule: "Legume before heavy feeder", effect: `+0.15 — ${prev.name} is a nitrogen fixer, ${candidate.name} is a heavy feeder` });
  }
  if (!lastThree.some((c) => c.family === candidate.family) && hist.length > 0) {
    score = Math.min(1, score + 0.1);
    applied.push({ rule: "New family in last 3 seasons", effect: `+0.1 — ${candidate.family} not grown in the last 3 seasons` });
  }
  return { score: Math.max(0, Math.min(1, score)), appliedRules: applied };
}
