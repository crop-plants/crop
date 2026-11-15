// Water demand and water-fit scoring (spec 6.2 / 6.3).
// ETc = Kc × ET0 per day; gross = net / irrigation efficiency;
// 1 mm over 1 acre = 4.047 m3.

import { IRRIGATION_EFFICIENCY, type CropDef } from "./types";

export function efficiencyFor(method: string): number {
  return IRRIGATION_EFFICIENCY[(method as keyof typeof IRRIGATION_EFFICIENCY)] ?? 0.75;
}

export const MM_PER_ACRE_TO_M3 = 4.047;

export interface WaterTotals {
  netMm: number | null; // null when any ETc inputs missing for the whole season
  validDays: number;
  windowDays: number;
  coverage: number;
}

export function accumulateWater(dailyEtc: (number | null)[]): WaterTotals {
  const windowDays = dailyEtc.length;
  let sum = 0;
  let valid = 0;
  for (const v of dailyEtc) {
    if (v != null && Number.isFinite(v)) {
      sum += v;
      valid++;
    }
  }
  // Require at least 60% valid coverage to report a water number honestly.
  const coverage = windowDays > 0 ? valid / windowDays : 0;
  return {
    netMm: coverage >= 0.6 ? sum : null,
    validDays: valid,
    windowDays,
    coverage,
  };
}

export function grossM3PerAcre(netMm: number, efficiency: number): number {
  return (netMm / efficiency) * MM_PER_ACRE_TO_M3;
}

export function waterScore(availableM3PerAcre: number, grossM3PerAcreVal: number | null): {
  ratio: number | null;
  score: number | null;
  fail: string | null;
} {
  if (grossM3PerAcreVal == null || grossM3PerAcreVal <= 0) return { ratio: null, score: null, fail: null };
  const ratio = availableM3PerAcre / grossM3PerAcreVal;
  const score = Math.min(1, ratio);
  const fail = ratio < 0.5 ? `Water: available ${Math.round(availableM3PerAcre)} m³ < 50% of gross requirement ${Math.round(grossM3PerAcreVal)} m³/acre` : null;
  return { ratio, score, fail };
}

export function availableWaterM3(farmAllowanceM3PerAcre: number, availabilityPct: number): number {
  return (farmAllowanceM3PerAcre * availabilityPct) / 100;
}

export { IRRIGATION_EFFICIENCY };
