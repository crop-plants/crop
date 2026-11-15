// NASA POWER daily sync — real data only. Fill value -999 => null.
// The engine reads ClimateDaily; nothing is ever interpolated or invented.

import { db } from "@/lib/db";
import { fao56Et0, dayOfYear } from "./et0";
import type { DailyClimate } from "./types";

export const POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point";

export interface PowerSyncResult {
  ok: boolean;
  status: "live" | "cached" | "unavailable";
  rows: number;
  start?: string;
  end?: string;
  message?: string;
  fetchedAt?: string;
}

function n(v: number | undefined): number | null {
  if (v == null || !Number.isFinite(v) || v === -999 || v === -999.0) return null;
  return v;
}

export async function fetchPowerDaily(
  lat: number,
  lon: number,
  start: string, // YYYYMMDD
  end: string, // YYYYMMDD
): Promise<{ ok: boolean; daily: DailyClimate[]; message?: string }> {
  const params = ["T2M", "T2M_MAX", "T2M_MIN", "RH2M", "WS2M", "ALLSKY_SFC_SW_DWN", "PRECTOTCORR"];
  const url = `${POWER_URL}?parameters=${params.join(",")}&community=AG&longitude=${lon}&latitude=${lat}&start=${start}&end=${end}&format=JSON&time-standard=LST`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!res.ok) return { ok: false, daily: [], message: `NASA POWER HTTP ${res.status}` };
    const json = (await res.json()) as {
      properties?: { parameter?: Record<string, Record<string, number>> };
      geometry?: { coordinates?: [number, number, number] };
      messages?: string[];
    };
    const p = json.properties?.parameter;
    if (!p) return { ok: false, daily: [], message: "NASA POWER response missing parameter block" };
    const elev = json.geometry?.coordinates?.[2] ?? 270;
    const dates = new Set<string>();
    for (const series of Object.values(p)) for (const k of Object.keys(series)) dates.add(k);
    const daily: DailyClimate[] = [];
    const sorted = [...dates].sort();
    for (const date of sorted) {
      const tmax = n(p.T2M_MAX?.[date]);
      const tmin = n(p.T2M_MIN?.[date]);
      const t2m = n(p.T2M?.[date]);
      const rh = n(p.RH2M?.[date]);
      const wind = n(p.WS2M?.[date]);
      const solar = n(p.ALLSKY_SFC_SW_DWN?.[date]);
      const rain = n(p.PRECTOTCORR?.[date]);
      const tmean = t2m ?? (tmax != null && tmin != null ? (tmax + tmin) / 2 : null);
      let et0Mm: number | null = null;
      if (tmax != null && tmin != null && rh != null && wind != null && solar != null) {
        const dt = new Date(Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8)));
        et0Mm = fao56Et0({ tmax, tmin, rhMean: rh, u2: wind, rs: solar, latDeg: lat, elevM: elev, doy: dayOfYear(dt) }).et0;
      }
      daily.push({ date, tmax, tmin, tmean, rh, wind2m: wind, solarMj: solar, rainMm: rain, et0Mm });
    }
    return { ok: daily.length > 0, daily, message: daily.length ? undefined : "NASA POWER returned no rows" };
  } catch (e) {
    return { ok: false, daily: [], message: `NASA POWER request failed: ${(e as Error).message}` };
  }
}

/** Fetch + upsert into ClimateDaily. Used by the CLI script and the refresh API. */
export async function syncPowerToDb(lat: number, lon: number, start: string, end: string): Promise<PowerSyncResult> {
  const r = await fetchPowerDaily(lat, lon, start, end);
  if (!r.ok) {
    return { ok: false, status: "unavailable", rows: 0, message: r.message };
  }
  const fetchedAt = new Date();
  let rows = 0;
  for (const d of r.daily) {
    await db.climateDaily.upsert({
      where: { date: d.date },
      create: { ...d, source: "NASA POWER", fetchedAt },
      update: { ...d, source: "NASA POWER", fetchedAt },
    });
    rows++;
  }
  const count = await db.climateDaily.count();
  await db.setting.upsert({
    where: { key: "nasa_power_meta" },
    create: {
      key: "nasa_power_meta",
      valueJson: JSON.stringify({
        lat, lon, start, end,
        fetchedAt: fetchedAt.toISOString(),
        rowsThisSync: rows,
        rowsTotal: count,
        source: "NASA POWER Daily API (community AG)",
        url: POWER_URL,
      }),
    },
    update: {
      valueJson: JSON.stringify({
        lat, lon, start, end,
        fetchedAt: fetchedAt.toISOString(),
        rowsThisSync: rows,
        rowsTotal: count,
        source: "NASA POWER Daily API (community AG)",
        url: POWER_URL,
      }),
    },
  });
  return { ok: true, status: "live", rows, start, end, fetchedAt: fetchedAt.toISOString() };
}
