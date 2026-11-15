// FAO-29 (Ayers & Westcot, "Water Quality for Agriculture", rev. 1985)
// salinity response: relative yield Yr = 100 - b*(ECe - a) for ECe > a.
// a = ECe threshold (dS/m, 100% yield), b = slope (% per dS/m).
// Confirmed rows were checked against the FAO source table
// (https://www.fao.org/4/t0234e/t0234e03.htm) on 2026-11-15.

import type { AppliedRule, CropDef } from "./types";

/** ECe from irrigation water EC: ECe ≈ 1.5 × ECw for typical leaching fraction (setting). */
export const ECW_TO_ECE = 1.5;

export function relativeYieldPct(a: number, b: number, ece: number): number {
  if (ece <= a) return 100;
  return Math.max(0, 100 - b * (ece - a));
}

export interface SalinityResult {
  eceUsed: number;
  relativeYieldPct: number;
  appliedRules: AppliedRule[];
}

export function salinityAssessment(crop: CropDef, ece: number): SalinityResult {
  const a = crop.eceThreshold.value;
  const b = crop.eceSlope.value;
  const yr = relativeYieldPct(a, b, ece);
  const applied: AppliedRule[] = [
    {
      rule: "FAO-29 relative yield",
      effect: `Yr = 100 − ${b} × (ECe ${ece.toFixed(1)} − ${a.toFixed(1)}) = ${yr.toFixed(0)}%`,
    },
  ];
  if (ece <= a) {
    applied.unshift({ rule: "Below threshold", effect: `ECe ${ece.toFixed(1)} ≤ threshold ${a.toFixed(1)} dS/m: no yield reduction expected` });
  }
  return { eceUsed: ece, relativeYieldPct: yr, appliedRules: applied };
}

/** Texture-dependent factor from a 1:5 extract to saturated-paste ECe (editable in Settings). */
const EC15_TO_ECE_BY_TEXTURE: Record<string, number> = {
  sand: 3.0,
  "loamy sand": 2.6,
  "sandy loam": 2.2,
  loam: 1.8,
  "clay loam": 1.4,
};

export function ec15ToEce(ec15: number, texture: string): number {
  const f = EC15_TO_ECE_BY_TEXTURE[texture?.toLowerCase()] ?? 1.8;
  return ec15 * f;
}
