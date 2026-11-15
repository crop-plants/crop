// Field Health — three transparent rules (spec 4.6). Evidence is returned with
// every verdict. No automatic disease or nutrient diagnosis.

import type { CropDef } from "./types";

export type HealthStatus = "ok" | "watch" | "alert";

export interface HealthEvidence {
  rule: string;
  status: HealthStatus;
  text: string;
}

export interface HealthAlertInput {
  ts: Date;
  rule: string;
  severity: HealthStatus;
  message: string;
}

export interface HealthAssessment {
  status: HealthStatus;
  topReason: string | null;
  evidence: HealthEvidence[];
  alerts: HealthAlertInput[];
}

export interface MoistureSeries {
  ts: Date;
  value: number | null;
  flag: string;
}

export interface EcSeries {
  ts: Date;
  value: number | null;
  flag: string;
}

/** Rule 1: moisture below the crop stress threshold > 6 h -> Watch; > 24 h -> Alert. */
export function moistureStressRule(
  series: MoistureSeries[],
  crop: CropDef | null,
  stressThresholdPct: number,
  now: Date,
): HealthEvidence {
  const name = crop?.name ?? "selected crop";
  const sixH = 6 * 3600000;
  const dayMs = 24 * 3600000;
  let streakStart: Date | null = null;
  let lastOk: Date | null = null;
  for (const r of series) {
    if (r.value != null && r.flag === "ok" && r.value < stressThresholdPct) {
      if (!streakStart) streakStart = r.ts;
    } else if (r.value != null && r.flag === "ok") {
      if (streakStart) lastOk = r.ts;
      streakStart = null;
    }
  }
  const active = streakStart != null && now.getTime() - streakStart.getTime() > sixH;
  const durMs = streakStart ? now.getTime() - streakStart.getTime() : 0;
  if (!active) {
    return { rule: "Moisture stress", status: "ok", text: `No moisture stress: no period below ${stressThresholdPct}% lasting > 6 h for ${name}` };
  }
  const status: HealthStatus = durMs > dayMs ? "alert" : "watch";
  const hrs = (durMs / 3600000).toFixed(1);
  return {
    rule: "Moisture stress",
    status,
    text: `Soil moisture below ${stressThresholdPct}% (${name} stress threshold) for ${hrs} h`,
  };
}

/** Rule 2: EC above the crop threshold, or rising > 15% over 7 days. */
export function salinityRiskRule(
  series: EcSeries[],
  crop: CropDef | null,
  eceFactor: number,
  now: Date,
): HealthEvidence {
  const name = crop?.name ?? "selected crop";
  const threshold = crop ? crop.eceThreshold.value : 2.5;
  const usable = series.filter((r) => r.value != null && r.flag === "ok");
  const latest = usable[usable.length - 1];
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const older = usable.filter((r) => r.ts <= weekAgo);
  const past = older.length ? older[older.length - 1] : null;
  const eceNow = latest?.value != null ? latest.value * eceFactor : null;
  const ecePast = past?.value != null ? past.value * eceFactor : null;

  if (eceNow != null && eceNow > threshold) {
    return {
      rule: "Salinity risk",
      status: "alert",
      text: `ECe ${eceNow.toFixed(1)} dS/m is above the ${name} threshold ${threshold.toFixed(1)} dS/m`,
    };
  }
  if (eceNow != null && ecePast != null && ecePast > 0) {
    const rise = (eceNow - ecePast) / ecePast;
    if (rise > 0.15) {
      return {
        rule: "Salinity risk",
        status: "watch",
        text: `ECe rising: ${ecePast.toFixed(1)} → ${eceNow.toFixed(1)} dS/m (+${(rise * 100).toFixed(0)}% over 7 days)`,
      };
    }
  }
  if (eceNow != null) {
    return { rule: "Salinity risk", status: "ok", text: `ECe ${eceNow.toFixed(1)} dS/m within ${name} threshold ${threshold.toFixed(1)} dS/m` };
  }
  return { rule: "Salinity risk", status: "ok", text: "No usable EC readings" };
}

/** Rule 3: sensor reliability (stuck / out-of-range / offline) counts. */
export function sensorReliabilityRule(
  flaggedCounts: { node: string; stuck: number; outOfRange: number; offlineIntervals: number }[],
): { evidence: HealthEvidence; worst: HealthStatus } {
  let worst: HealthStatus = "ok";
  const lines: string[] = [];
  for (const f of flaggedCounts) {
    if (f.stuck > 0) {
      lines.push(`${f.node}: ${f.stuck} stuck readings excluded`);
      if (worst === "ok") worst = "watch";
    }
    if (f.outOfRange > 0) {
      lines.push(`${f.node}: ${f.outOfRange} out-of-range readings excluded`);
      if (worst === "ok") worst = "watch";
    }
    if (f.offlineIntervals > 0) {
      lines.push(`${f.node}: offline for ${f.offlineIntervals} intervals`);
      worst = "alert";
    }
  }
  return {
    evidence: {
      rule: "Sensor reliability",
      status: worst,
      text: lines.length ? lines.join("; ") : "All sensors reporting normally",
    },
    worst,
  };
}

export function combineHealth(evidence: HealthEvidence[]): HealthAssessment {
  let status: HealthStatus = "ok";
  for (const e of evidence) {
    if (e.status === "alert") status = "alert";
    else if (e.status === "watch" && status !== "alert") status = "watch";
  }
  const first = evidence.find((e) => e.status === status && e.status !== "ok");
  return { status, topReason: first ? `${first.rule}: ${first.text}` : null, evidence, alerts: [] };
}
