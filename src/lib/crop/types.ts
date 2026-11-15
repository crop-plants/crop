// C.R.O.P. shared types. Deterministic engine layer — no React, no DB here.

export type Provenance = "measured" | "estimated" | "simulated";
export type DataStatus = "live" | "cached" | "unavailable" | "demo";

export type SensorKind =
  | "moisture"
  | "soil_temp"
  | "ec"
  | "ph"
  | "air_temp"
  | "air_rh";

export interface DailyClimate {
  date: string; // YYYYMMDD
  tmax: number | null;
  tmin: number | null;
  tmean: number | null;
  rh: number | null; // RH2M %
  wind2m: number | null; // m/s
  solarMj: number | null; // ALLSKY_SFC_SW_DWN MJ/m2/day
  rainMm: number | null;
  et0Mm: number | null; // baseline FAO-56 PM (no scenario delta)
}

export interface Verified<T = number> {
  value: T;
  status: "confirmed" | "verify";
  source: string;
  note?: string;
}

export interface CropDef {
  id: string;
  name: string;
  family: string;
  icon: string;
  /** FAO-29 threshold a (dS/m) and slope b (% per dS/m) */
  eceThreshold: Verified;
  eceSlope: Verified;
  fao29Row?: { ec100: number; ec90: number; ec75: number; ec50: number };
  /** FAO-56 Table 12 crop coefficients */
  kcIni: Verified;
  kcMid: Verified;
  kcEnd: Verified;
  /** stage lengths in days: initial, development, mid, late */
  stages: { ini: number; dev: number; mid: number; late: number };
  stagesStatus: "confirmed" | "verify";
  /** maximum tolerable daily Tmax (deg C) */
  heatLimitTmax: Verified;
  /** months (1-12) in which sowing is agronomically valid for UAE */
  sowMonths: number[];
  sowMonthsStatus: "confirmed" | "verify";
  nitrogenRole: "fixer" | "heavy" | "light";
  durationDays: number;
}

export interface FarmProfileLite {
  name: string;
  lat: number;
  lon: number;
  elevationM: number;
  areaAcres: number;
  soilTexture: string;
  waterEcDsm: number; // irrigation water EC dS/m
  irrigationAllowanceM3PerAcre: number;
  irrigationMethod: "drip" | "sprinkler" | "flood";
  cropHistory: { seasonLabel: string; cropId: string }[];
  polygonGeojson?: { type: "Polygon"; coordinates: [number, number][][] } | null;
}

export interface Scenario {
  tempDeltaC: number; // -2..+4 step 0.5
  waterAvailabilityPct: number; // 50..120
  salinitySource: "measured" | "regional";
  salinityStressDsm: number; // optional +X dS/m
  ecOverrideDsm: number | null;
}

export interface Weights {
  water: number;
  salinity: number;
  heat: number;
  rotation: number;
}

export interface SeasonWindow {
  label: string;
  kind: "cool" | "warm" | "custom";
  startYear: number;
  startMonth: number; // 1-12
  days: number;
  startDate: Date;
}

export type StatusChip = "recommended" | "possible" | "risky" | "excluded";

export interface AppliedRule {
  rule: string;
  effect: string;
}

export interface CropScore {
  cropId: string;
  overall: number; // 0-100
  components: { water: number; salinity: number; heat: number; rotation: number };
  status: StatusChip;
  hardFails: string[];
  seasonLabel: string;
  water: {
    netMm: number | null;
    grossM3PerAcre: number | null;
    availableM3PerAcre: number;
    ratio: number | null;
    efficiency: number;
    validDays: number;
    windowDays: number;
    dailySeries: { day: number; date: string; et0: number | null; kc: number; etc: number | null; tmax: number | null }[];
  };
  salinity: {
    eceUsed: number;
    source: Provenance;
    relativeYieldPct: number;
    a: number;
    b: number;
  };
  heat: {
    stressDays: number;
    windowDays: number;
    fraction: number;
    limitC: number;
    peakTmax: number | null;
  };
  rotation: { score: number; appliedRules: AppliedRule[] };
  summaryLine: string;
}

export interface SequenceScore {
  cropIds: string[];
  seasons: { seasonLabel: string; cropId: string; overall: number }[];
  combined: number;
  rotationNotes: string[];
  totalWaterM3PerAcre: number;
}

export interface RotationRunParams {
  farm: FarmProfileLite;
  scenario: Scenario;
  weights: Weights;
  cropPool: string[];
  horizon: 1 | 2 | 3;
  seasonKind: "cool" | "warm" | "custom";
  customStartMonth?: number;
  startYear: number;
}

export interface RotationRunResult {
  ranked: CropScore[];
  excluded: CropScore[];
  sequences: SequenceScore[];
  baseline?: Record<string, number>;
  evaluatedCrops: number;
  computedAtMs: number;
  climatologyYears: number;
  eceProvenance: Provenance;
}

export const HARD_RULES = {
  waterRatioMin: 0.5,
  salinityMinYieldPct: 50,
} as const;

export const IRRIGATION_EFFICIENCY = { drip: 0.9, sprinkler: 0.75, flood: 0.6 } as const;

export const SENSOR_META: Record<SensorKind, { label: string; unit: string; color: string }> = {
  moisture: { label: "Soil moisture", unit: "%", color: "#8EC9E8" },
  soil_temp: { label: "Soil temperature", unit: "°C", color: "#E3B341" },
  ec: { label: "Soil EC", unit: "dS/m", color: "#E5604D" },
  ph: { label: "pH", unit: "", color: "#6C9A52" },
  air_temp: { label: "Air temperature", unit: "°C", color: "#E3B341" },
  air_rh: { label: "Air humidity", unit: "%", color: "#8EC9E8" },
};
