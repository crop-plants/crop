// Crop coefficient curve by growth stage (FAO-56 Chapter 6 procedure).
// Stages: initial (Kc = Kc_ini), development (linear ini→mid),
// mid-season (Kc = Kc_mid), late (linear mid→end).

import type { CropDef } from "./types";

export function cropDurationDays(crop: CropDef): number {
  const s = crop.stages;
  return s.ini + s.dev + s.mid + s.late;
}

/** Kc for day index (0-based) of the season. Clamps beyond duration. */
export function kcForDay(crop: CropDef, dayIndex: number): number {
  const { ini, dev, mid, late } = crop.stages;
  const { kcIni, kcMid, kcEnd } = { kcIni: crop.kcIni.value, kcMid: crop.kcMid.value, kcEnd: crop.kcEnd.value };
  if (dayIndex < ini) return kcIni;
  if (dayIndex < ini + dev) {
    const f = (dayIndex - ini + 1) / dev;
    return kcIni + (kcMid - kcIni) * f;
  }
  if (dayIndex < ini + dev + mid) return kcMid;
  if (dayIndex < ini + dev + mid + late) {
    const f = (dayIndex - (ini + dev + mid) + 1) / late;
    return kcMid + (kcEnd - kcMid) * Math.min(1, f);
  }
  return kcEnd;
}
