// RotationIQ — the deterministic ranking engine (spec section 6).
// No language model anywhere: every number comes from the formulas below and
// every result is reproducible from the same inputs.

import { fao56Et0, dayOfYear } from "./et0";
import { kcForDay, cropDurationDays } from "./kc";
import { salinityAssessment, ECW_TO_ECE } from "./salinity";
import { rotationScore } from "./rotation";
import { accumulateWater, grossM3PerAcre, waterScore, availableWaterM3, efficiencyFor } from "./water";
import { climatologyFor, type Climatology } from "./climatology";
import { CROP_BY_ID } from "./data/crops";
import type {
  CropScore,
  CropDef,
  DailyClimate,
  RotationRunParams,
  RotationRunResult,
  Scenario,
  SeasonWindow,
  SequenceScore,
  StatusChip,
  Weights,
  FarmProfileLite,
} from "./types";

const SEASON_DAYS = 183; // six-month window

export function seasonWindows(params: RotationRunParams): SeasonWindow[] {
  const out: SeasonWindow[] = [];
  let kind = params.seasonKind;
  let year = params.startYear;
  let month: number;
  if (kind === "cool") month = 10;
  else if (kind === "warm") month = 4;
  else month = params.customStartMonth ?? 10;
  for (let i = 0; i < params.horizon; i++) {
    const label =
      kind === "cool"
        ? `Cool ${year}-${String((year + 1) % 100).padStart(2, "0")}`
        : kind === "warm"
          ? `Warm ${year}`
          : `Custom ${year}-${String(month).padStart(2, "0")}`;
    out.push({
      label,
      kind,
      startYear: year,
      startMonth: month,
      days: SEASON_DAYS,
      startDate: new Date(Date.UTC(year, month - 1, 1)),
    });
    // alternate cool -> warm -> cool (or custom: advance 6 months)
    if (kind === "custom") {
      month += 6;
      if (month > 12) { month -= 12; year += 1; }
    } else {
      kind = kind === "cool" ? "warm" : "cool";
      if (kind === "cool") year += 1;
    }
  }
  return out;
}

interface SeasonEval {
  waterNetMm: number | null;
  validDays: number;
  windowDays: number;
  grossM3PerAcre: number | null;
  stressDays: number;
  peakTmax: number | null;
  dailySeries: CropScore["water"]["dailySeries"];
  insufficient: boolean;
}

export interface EngineContext {
  farm: FarmProfileLite;
  scenario: Scenario;
  clim: Climatology;
  crops: CropDef[];
  measuredEceDsm: number | null;
  climatologyYears: number;
  weights: () => Weights;
}

/** Season key for the per-(crop, window, scenario) memo cache. */
const scenarioKey = (s: Scenario): string =>
  `${s.tempDeltaC}|${s.waterAvailabilityPct}|${s.salinitySource}|${s.salinityStressDsm}|${s.ecOverrideDsm ?? "-"}`;

export function effectiveEceDsm(farm: FarmProfileLite, scenario: Scenario, measuredEceDsm: number | null): { ece: number; source: "measured" | "estimated" } {
  const stress = scenario.salinityStressDsm || 0;
  if (scenario.salinitySource === "measured" && measuredEceDsm != null && Number.isFinite(measuredEceDsm)) {
    return { ece: measuredEceDsm + stress, source: "measured" };
  }
  const waterEc = scenario.ecOverrideDsm ?? farm.waterEcDsm;
  return { ece: waterEc * ECW_TO_ECE + stress, source: "estimated" };
}

export function evaluateSeason(
  crop: CropDef,
  window: SeasonWindow,
  ctx: EngineContext,
  cache: Map<string, SeasonEval>,
): SeasonEval {
  const key = `${crop.id}|${window.label}|${scenarioKey(ctx.scenario)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const dur = Math.min(cropDurationDays(crop), window.days);
  const { farm, scenario } = ctx;
  const dailySeries: CropScore["water"]["dailySeries"] = [];
  const etcList: (number | null)[] = [];
  let stressDays = 0;
  let peakTmax: number | null = null;

  for (let d = 0; d < dur; d++) {
    const date = new Date(window.startDate.getTime() + d * 86400000);
    const climDay = climatologyFor(ctx.clim, date);
    let et0: number | null = null;
    let tmaxAdj: number | null = null;
    let kc = kcForDay(crop, d);
    if (climDay && climDay.tmax != null && climDay.tmin != null) {
      tmaxAdj = climDay.tmax + scenario.tempDeltaC;
      const tminAdj = climDay.tmin + scenario.tempDeltaC;
      const br = fao56Et0({
        tmax: tmaxAdj,
        tmin: tminAdj,
        rhMean: climDay.rh,
        u2: climDay.wind2m,
        rs: climDay.solarMj,
        latDeg: farm.lat,
        elevM: farm.elevationM,
        doy: dayOfYear(date),
      });
      et0 = br.et0;
    }
    const etc = et0 != null ? kc * et0 : null;
    etcList.push(etc);
    if (tmaxAdj != null) {
      if (tmaxAdj > crop.heatLimitTmax.value) stressDays++;
      if (peakTmax == null || tmaxAdj > peakTmax) peakTmax = tmaxAdj;
    }
    dailySeries.push({
      day: d + 1,
      date: date.toISOString().slice(0, 10),
      et0: et0 != null ? Math.round(et0 * 100) / 100 : null,
      kc: Math.round(kc * 100) / 100,
      etc: etc != null ? Math.round(etc * 100) / 100 : null,
      tmax: tmaxAdj != null ? Math.round(tmaxAdj * 10) / 10 : null,
    });
  }

  const totals = accumulateWater(etcList);
  const insufficient = totals.netMm == null;
  const eff = efficiencyFor(farm.irrigationMethod);
  const gross = totals.netMm != null ? grossM3PerAcre(totals.netMm, eff) : null;

  const result: SeasonEval = {
    waterNetMm: totals.netMm,
    validDays: totals.validDays,
    windowDays: totals.windowDays,
    grossM3PerAcre: gross,
    stressDays,
    peakTmax,
    dailySeries,
    insufficient,
  };
  cache.set(key, result);
  return result;
}

export function scoreCrop(
  crop: CropDef,
  window: SeasonWindow,
  history: CropDef[],
  ctx: EngineContext,
  cache: Map<string, SeasonEval>,
): CropScore {
  const ev = evaluateSeason(crop, window, ctx, cache);
  const hardFails: string[] = [];

  // Sowing window rule
  if (!crop.sowMonths.includes(window.startMonth)) {
    hardFails.push(`${crop.name} excluded: sowing window closed — valid months ${crop.sowMonths.join(", ")}, window starts ${window.label} (${monthName(window.startMonth)})`);
  }

  // Water rule
  const available = availableWaterM3(ctx.farm.irrigationAllowanceM3PerAcre, ctx.scenario.waterAvailabilityPct);
  const w = waterScore(available, ev.grossM3PerAcre);
  if (ev.insufficient) {
    hardFails.push(`${crop.name} excluded: insufficient climate data (<60% of season days have valid climatology)`);
  } else if (w.fail) {
    hardFails.push(w.fail);
  }

  // Salinity rule
  const { ece, source } = effectiveEceDsm(ctx.farm, ctx.scenario, ctx.measuredEceDsm);
  const sal = salinityAssessment(crop, ece);
  if (sal.relativeYieldPct < 50) {
    hardFails.push(`${crop.name} excluded: expected relative yield ${sal.relativeYieldPct.toFixed(0)}% at ECe ${ece.toFixed(1)} dS/m (< 50%)`);
  }

  const sWater = w.score ?? 0;
  const sSalinity = sal.relativeYieldPct / 100;
  const frac = ev.windowDays > 0 ? ev.stressDays / ev.windowDays : 0;
  const sHeat = Math.max(0, Math.min(1, 1 - frac / 0.4));
  const rot = rotationScore(crop, { history });

  const weights = ctx.weights();
  const overallRaw =
    weights.water * sWater + weights.salinity * sSalinity + weights.heat * sHeat + weights.rotation * rot.score;
  const overall = Math.round(overallRaw * 1000) / 10;

  const status: StatusChip = hardFails.length > 0 ? "excluded" : overall >= 70 ? "recommended" : overall >= 50 ? "possible" : "risky";

  const parts: string[] = [];
  if (!ev.insufficient && ev.grossM3PerAcre != null) parts.push(`peak water demand ${Math.round(ev.waterNetMm ?? 0)} mm (${Math.round(ev.grossM3PerAcre)} m³/acre gross)`);
  parts.push(`${ev.stressDays} days above ${crop.heatLimitTmax.value}°C in the window`);
  parts.push(`expected relative yield ${sal.relativeYieldPct.toFixed(0)}% at ECe ${ece.toFixed(1)} dS/m (${source})`);
  if (hardFails.length === 0 && frac > 0.25) parts.push("high heat stress — fruit set can be reduced");

  return {
    cropId: crop.id,
    overall,
    components: { water: sWater, salinity: sSalinity, heat: sHeat, rotation: rot.score },
    status,
    hardFails,
    seasonLabel: window.label,
    water: {
      netMm: ev.waterNetMm,
      grossM3PerAcre: ev.grossM3PerAcre,
      availableM3PerAcre: available,
      ratio: w.ratio,
      efficiency: efficiencyFor(ctx.farm.irrigationMethod),
      validDays: ev.validDays,
      windowDays: ev.windowDays,
      dailySeries: ev.dailySeries,
    },
    salinity: { eceUsed: ece, source, relativeYieldPct: sal.relativeYieldPct, a: crop.eceThreshold.value, b: crop.eceSlope.value },
    heat: { stressDays: ev.stressDays, windowDays: ev.windowDays, fraction: frac, limitC: crop.heatLimitTmax.value, peakTmax: ev.peakTmax },
    rotation: rot,
    summaryLine: `${crop.name} scores ${overall.toFixed(0)}. ${parts.join(". ")}.`,
  };
}

const monthName = (m: number): string =>
  ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];

export interface RunEngineInput {
  farm: FarmProfileLite;
  daily: DailyClimate[];
  params: RotationRunParams;
  measuredEceDsm: number | null;
  clim: Climatology;
  cropPool: string[];
  weights: Weights;
}

export function runRotationEngine(input: RunEngineInput): RotationRunResult {
  const t0 = Date.now();
  const ctx: EngineContext = {
    farm: input.farm,
    scenario: input.params.scenario,
    clim: input.clim,
    crops: Object.values(CROP_BY_ID),
    measuredEceDsm: input.measuredEceDsm,
    climatologyYears: input.clim.yearsCovered,
    weights: () => input.weights,
  };
  const windows = seasonWindows(input.params);
  const cache = new Map<string, SeasonEval>();
  const historyDefs = input.farm.cropHistory
    .map((h) => CROP_BY_ID[h.cropId])
    .filter(Boolean);

  // Rank crops for the first season
  const scored: CropScore[] = input.cropPool
    .map((id) => CROP_BY_ID[id])
    .filter(Boolean)
    .map((crop) => scoreCrop(crop, windows[0], historyDefs, ctx, cache));
  scored.sort((a, b) => b.overall - a.overall);
  const ranked = scored.filter((s) => s.status !== "excluded");
  const excluded = scored.filter((s) => s.status === "excluded");

  // Multi-season sequences over the full pool (best ordering per combination)
  let sequences: SequenceScore[] = [];
  if (input.params.horizon > 1) {
    const pool = input.cropPool.map((id) => CROP_BY_ID[id]).filter(Boolean);
    const seqs: SequenceScore[] = [];
    const rec = (prefix: CropDef[], depth: number) => {
      if (depth === 0) {
        let total = 0;
        let water = 0;
        const seasons: SequenceScore["seasons"] = [];
        const notes: string[] = [];
        const hist = [...historyDefs];
        for (let i = 0; i < prefix.length; i++) {
          const crop = prefix[i];
          const s = scoreCrop(crop, windows[i], hist, ctx, cache);
          total += s.overall;
          if (s.water.grossM3PerAcre != null) water += s.water.grossM3PerAcre;
          seasons.push({ seasonLabel: windows[i].label, cropId: crop.id, overall: s.overall });
          if (s.rotation.appliedRules.length > 1) {
            const note = s.rotation.appliedRules.find((r) => r.rule !== "Start");
            if (note) notes.push(`${windows[i].label}: ${note.effect}`);
          }
          hist.push(crop);
        }
        seqs.push({
          cropIds: prefix.map((c) => c.id),
          seasons,
          combined: Math.round((total / prefix.length) * 10) / 10,
          rotationNotes: notes.slice(0, 3),
          totalWaterM3PerAcre: Math.round(water),
        });
        return;
      }
      for (const crop of pool) rec([...prefix, crop], depth - 1);
    };
    rec([], input.params.horizon);
    seqs.sort((a, b) => b.combined - a.combined);
    sequences = seqs.slice(0, 3);
  }

  return {
    ranked,
    excluded,
    sequences,
    evaluatedCrops: scored.length,
    computedAtMs: Date.now() - t0,
    climatologyYears: input.clim.yearsCovered,
    eceProvenance: effectiveEceDsm(input.farm, input.params.scenario, input.measuredEceDsm).source === "measured" ? "measured" : "estimated",
  };
}

/** Overall (0-100) for a single crop — used for sensitivity charts and baseline deltas. */
export function cropOverallFor(cropId: string, window: SeasonWindow, history: CropDef[], ctx: EngineContext, cache: Map<string, SeasonEval>): number {
  const crop = CROP_BY_ID[cropId];
  if (!crop) return 0;
  return scoreCrop(crop, window, history, ctx, cache).overall;
}

/**
 * Sensitivity sweep: the crop's overall score across a range of temperature
 * deltas, everything else held constant. Used by the explanation drawer.
 */
export function overallAcrossTemps(
  cropId: string,
  input: RunEngineInput,
  window: SeasonWindow,
  temps: number[],
): { temp: number; overall: number }[] {
  const out: { temp: number; overall: number }[] = [];
  const historyDefs = input.farm.cropHistory.map((h) => CROP_BY_ID[h.cropId]).filter(Boolean);
  for (const t of temps) {
    const ctx: EngineContext = {
      farm: input.farm,
      scenario: { ...input.params.scenario, tempDeltaC: t },
      clim: input.clim,
      crops: Object.values(CROP_BY_ID),
      measuredEceDsm: input.measuredEceDsm,
      climatologyYears: input.clim.yearsCovered,
      weights: () => input.weights,
    };
    const crop = CROP_BY_ID[cropId];
    if (!crop) continue;
    const s = scoreCrop(crop, window, historyDefs, ctx, new Map());
    out.push({ temp: t, overall: s.status === "excluded" ? 0 : s.overall });
  }
  return out;
}
