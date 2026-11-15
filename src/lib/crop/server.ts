// Server-side helpers shared by the /api/v1 routes: settings access, farm
// mapping, climatology cache, and the measured-ECe derivation.

import { db } from "@/lib/db";
import { buildClimatology, type Climatology } from "./climatology";
import { median } from "./quality";
import type { DailyClimate, FarmProfileLite, Scenario, Weights } from "./types";
import { DEFAULT_SETTINGS, DEFAULT_WEIGHTS } from "./seed";
import { ec15ToEce } from "./salinity";

export interface AppSettings {
  moistureStressThresholdPct: number;
  offlineIntervalLimit: number;
  ec15ToEceFactor: number;
  ecwToEce: number;
  selectedCropId: string;
  language: string;
}

export async function getSettings(): Promise<AppSettings> {
  const row = await db.setting.findUnique({ where: { key: "appSettings" } });
  if (!row) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...JSON.parse(row.valueJson) };
}

export async function getWeights(): Promise<Weights> {
  const row = await db.setting.findUnique({ where: { key: "weights" } });
  if (!row) return { ...DEFAULT_WEIGHTS };
  return { ...DEFAULT_WEIGHTS, ...JSON.parse(row.valueJson) };
}

export async function getScenario(): Promise<Scenario> {
  const row = await db.setting.findUnique({ where: { key: "scenario" } });
  if (!row) return { tempDeltaC: 0, waterAvailabilityPct: 100, salinitySource: "measured", salinityStressDsm: 0, ecOverrideDsm: null };
  return JSON.parse(row.valueJson);
}

export async function putSetting(key: string, value: unknown): Promise<void> {
  const valueJson = JSON.stringify(value);
  await db.setting.upsert({ where: { key }, create: { key, valueJson }, update: { valueJson } });
}

export async function getFarm(): Promise<{ farm: FarmProfileLite; id: string } | null> {
  const f = await db.farm.findFirst({ orderBy: { createdAt: "asc" } });
  if (!f) return null;
  return {
    id: f.id,
    farm: {
      name: f.name,
      lat: f.lat,
      lon: f.lon,
      elevationM: f.elevationM,
      areaAcres: 1, // derived from polygon area when drawn; fixed case-study value
      soilTexture: f.soilTexture,
      waterEcDsm: f.waterEcDsm,
      irrigationAllowanceM3PerAcre: f.irrigationAllowanceM3PerAcre,
      irrigationMethod: f.irrigationMethod as FarmProfileLite["irrigationMethod"],
      cropHistory: JSON.parse(f.cropHistory || "[]"),
      polygonGeojson: f.polygonGeojson ? JSON.parse(f.polygonGeojson) : null,
    },
  };
}

let climCache: { clim: Climatology; rows: DailyClimate[]; fetchedAt: string } | null = null;

export async function getClimateCache(): Promise<{ clim: Climatology; rows: DailyClimate[]; meta: Record<string, unknown> | null }> {
  const rowsDb = await db.climateDaily.findMany({ orderBy: { date: "asc" } });
  const rows: DailyClimate[] = rowsDb.map((r) => ({
    date: r.date,
    tmax: r.tmax,
    tmin: r.tmin,
    tmean: r.tmean,
    rh: r.rh,
    wind2m: r.wind2m,
    solarMj: r.solarMj,
    rainMm: r.rainMm,
    et0Mm: r.et0Mm,
  }));
  const clim = buildClimatology(rows);
  const metaRow = await db.setting.findUnique({ where: { key: "nasa_power_meta" } });
  const meta = metaRow ? JSON.parse(metaRow.valueJson) : null;
  climCache = { clim, rows, fetchedAt: meta?.fetchedAt ?? "" };
  return { clim, rows, meta };
}

/**
 * Measured ECe (dS/m, saturated-paste basis): median of the last 7 days of
 * usable (flag=ok) soil-node EC readings converted with the texture factor.
 * Returns null when no usable readings exist — never a guess.
 */
export async function getMeasuredEceDsm(): Promise<{ ece: number | null; n: number }> {
  const settings = await getSettings();
  const since = new Date(Date.now() - 7 * 86400000);
  const soilNodes = await db.node.findMany({ where: { type: "soil_node" }, select: { id: true } });
  const readings = await db.reading.findMany({
    where: { nodeId: { in: soilNodes.map((n) => n.id) }, sensor: "ec", ts: { gte: since }, qualityFlag: "ok" },
    select: { value: true },
    take: 6000,
  });
  if (readings.length === 0) return { ece: null, n: 0 };
  const med = median(readings.map((r) => r.value));
  return { ece: ec15ToEce(med, (await getFarm())?.farm.soilTexture ?? "sandy loam") * 1, n: readings.length };
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
