// Historical climatology from cached NASA POWER daily data.
// For each calendar day (MM-DD), mean Tmax/Tmin/RH/wind/solar across years.
// Historical averages used for future windows — labelled ESTIMATED, never a
// forecast.

import type { DailyClimate } from "./types";

export interface ClimatologyDay {
  tmax: number | null;
  tmin: number | null;
  tmean: number | null;
  rh: number | null;
  wind2m: number | null;
  solarMj: number | null;
  years: number;
}

export interface Climatology {
  days: Map<string, ClimatologyDay>; // key "MM-DD"
  yearsCovered: number;
  validDays: number;
}

const MMDD = (dateKey: string): string => `${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;

type Field = "tmax" | "tmin" | "tmean" | "rh" | "wind2m" | "solarMj";
const FIELDS: Field[] = ["tmax", "tmin", "tmean", "rh", "wind2m", "solarMj"];

interface Slot {
  s: Record<Field, number>;
  n: Record<Field, number>;
  years: Set<string>;
}

export function buildClimatology(daily: DailyClimate[]): Climatology {
  const acc = new Map<string, Slot>();
  const yearSet = new Set<string>();
  for (const d of daily) {
    const key = MMDD(d.date);
    const slot: Slot = acc.get(key) ?? {
      s: { tmax: 0, tmin: 0, tmean: 0, rh: 0, wind2m: 0, solarMj: 0 },
      n: { tmax: 0, tmin: 0, tmean: 0, rh: 0, wind2m: 0, solarMj: 0 },
      years: new Set<string>(),
    };
    for (const f of FIELDS) {
      const v = d[f];
      if (v == null || !Number.isFinite(v)) continue;
      slot.s[f] += v;
      slot.n[f] += 1;
    }
    slot.years.add(d.date.slice(0, 4));
    yearSet.add(d.date.slice(0, 4));
    acc.set(key, slot);
  }
  const days = new Map<string, ClimatologyDay>();
  for (const [key, slot] of acc) {
    const day: ClimatologyDay = { tmax: null, tmin: null, tmean: null, rh: null, wind2m: null, solarMj: null, years: slot.years.size };
    for (const f of FIELDS) {
      if (slot.n[f] > 0) day[f] = slot.s[f] / slot.n[f];
    }
    days.set(key, day);
  }
  return { days, yearsCovered: yearSet.size, validDays: days.size };
}

/** Date (UTC) -> "MM-DD" key */
export const mmddOf = (date: Date): string =>
  `${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;

export function climatologyFor(clim: Climatology, date: Date): ClimatologyDay | null {
  return clim.days.get(mmddOf(date)) ?? null;
}
