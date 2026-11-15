// Sensor data-quality rules (spec 6.9, 4.6 rule 3). All deterministic.
// Flags: ok | suspect | stuck | out_of_range. Flagged readings are excluded
// from calculations but kept in the raw series.

import type { SensorKind } from "./types";

export interface QualityInput {
  sensor: SensorKind;
  values: (number | null)[]; // ordered by time; null = missing
}

export type QualityFlag = "ok" | "suspect" | "stuck" | "out_of_range";

export const PHYSICAL_RANGE: Record<SensorKind, [number, number]> = {
  moisture: [0, 100],
  soil_temp: [-10, 60],
  ec: [0, 20],
  ph: [0, 14],
  air_temp: [-10, 60],
  air_rh: [0, 100],
};

export function rollingMedian(values: (number | null)[], window: number): number[] {
  const out: number[] = [];
  const half = Math.floor(window / 2);
  for (let i = 0; i < values.length; i++) {
    const slice: number[] = [];
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      const v = values[j];
      if (v != null && Number.isFinite(v)) slice.push(v);
    }
    slice.sort((a, b) => a - b);
    const med = slice.length ? (slice.length % 2 ? slice[(slice.length - 1) / 2] : (slice[slice.length / 2 - 1] + slice[slice.length / 2]) / 2) : NaN;
    out.push(med);
  }
  return out;
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Robust z-score via median absolute deviation. */
export function madZscores(values: number[]): number[] {
  const med = median(values);
  const absDev = values.map((v) => Math.abs(v - med));
  const mad = median(absDev) || 1e-9;
  return values.map((v) => (0.6745 * (v - med)) / mad);
}

/**
 * Flag a series. Windows use sample counts assuming a fixed interval
 * (10 min default => 6 h = 36 samples, 24 h = 144).
 */
export function flagSeries(input: QualityInput, samplesPerHour = 6): QualityFlag[] {
  const { sensor, values } = input;
  const n = values.length;
  const out: QualityFlag[] = new Array(n).fill("ok");
  const [lo, hi] = PHYSICAL_RANGE[sensor];

  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) { out[i] = "suspect"; continue; }
    if (v < lo || v > hi) out[i] = "out_of_range";
  }

  // stuck: near-zero variance over a 6 h window
  const stuckWindow = Math.max(6 * samplesPerHour, 6);
  for (let i = stuckWindow - 1; i < n; i++) {
    const win: number[] = [];
    for (let j = i - stuckWindow + 1; j <= i; j++) {
      const v = values[j];
      if (v != null && Number.isFinite(v)) win.push(v);
    }
    if (win.length >= stuckWindow * 0.9) {
      const min = Math.min(...win);
      const max = Math.max(...win);
      if (max - min < 1e-6) {
        for (let j = i - stuckWindow + 1; j <= i; j++) if (out[j] === "ok") out[j] = "stuck";
      }
    }
  }

  // sudden jump: > 4 robust z-scores from the rolling median, using a LOCAL
  // rolling MAD so a half-constant series does not collapse the scale.
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) continue;
    const slice: number[] = [];
    for (let j = Math.max(0, i - 12); j <= Math.min(n - 1, i + 12); j++) {
      const u = values[j];
      if (u != null && Number.isFinite(u)) slice.push(u);
    }
    if (slice.length < 10) continue;
    const medI = median(slice);
    const madI = median(slice.map((u) => Math.abs(u - medI)));
    if (madI <= 1e-9) continue; // locally constant -> stuck rule owns this case
    const z = Math.abs((0.6745 * (v - medI)) / madI);
    if (z > 4 && out[i] === "ok") out[i] = "suspect";
  }
  return out;
}

/** Offline detection: missing intervals beyond 3 × interval. */
export function offlineGaps(timestamps: Date[], intervalMinutes: number): { start: Date; missed: number }[] {
  const gaps: { start: Date; missed: number }[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    const diffMin = (timestamps[i].getTime() - timestamps[i - 1].getTime()) / 60000;
    const missed = Math.round(diffMin / intervalMinutes) - 1;
    if (missed > 3) gaps.push({ start: timestamps[i - 1], missed });
  }
  return gaps;
}

export const EXCLUDED_FLAGS: QualityFlag[] = ["stuck", "out_of_range", "suspect"];
export const isUsable = (flag: QualityFlag): boolean => flag === "ok";
