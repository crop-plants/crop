"use client";

// Tiny typed API layer: fetchJson + a minimal useApi hook (no external deps).

import { useCallback, useEffect, useState } from "react";

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body as T;
}

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch: () => void;
}

export function useApi<T>(url: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    // defer the loading flag so no setState happens synchronously inside the effect
    queueMicrotask(() => {
      if (alive) setLoading(true);
    });
    fetchJson<T>(url)
      .then((d) => {
        if (alive) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: Error) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [url, tick]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, refetch };
}

// ---------- response types ----------

export interface HealthResponse {
  ok: boolean;
  app: string;
  database: string;
  farm: { name: string; dataMode: string } | null;
  data: {
    climateRows: number;
    sensorReadings: number;
    unacknowledgedAlerts: number;
    nasaPower: NasaPowerMeta | null;
  };
  time: string;
}

export interface NasaPowerMeta {
  lat: number;
  lon: number;
  start: string;
  end: string;
  fetchedAt: string;
  rowsTotal: number;
  source: string;
  url: string;
}

export interface FarmResponse {
  ok: boolean;
  id: string;
  farm: {
    name: string;
    lat: number;
    lon: number;
    elevationM: number;
    areaAcres: number;
    soilTexture: string;
    waterEcDsm: number;
    irrigationAllowanceM3PerAcre: number;
    irrigationMethod: "drip" | "sprinkler" | "flood";
    cropHistory: { seasonLabel: string; cropId: string }[];
    polygonGeojson: { type: "Polygon"; coordinates: [number, number][][] } | null;
  };
}

export interface SettingsResponse {
  ok: boolean;
  settings: {
    moistureStressThresholdPct: number;
    offlineIntervalLimit: number;
    ec15ToEceFactor: number;
    ecwToEce: number;
    selectedCropId: string;
    language: string;
  };
  weights: { water: number; salinity: number; heat: number; rotation: number };
  scenario: { tempDeltaC: number; waterAvailabilityPct: number; salinitySource: "measured" | "regional"; salinityStressDsm: number; ecOverrideDsm: number | null };
  dataMode: "demo" | "live";
  deviceApiKeys: { nodeId: string; name: string; key: string }[];
  nasaPowerMeta: NasaPowerMeta | null;
  measuredEce?: { ece: number | null; n: number };
}

export interface ClimateResponse {
  ok: boolean;
  status: "cached" | "unavailable";
  count: number;
  meta: Record<string, unknown> & { fetchedAt?: string };
  rows: {
    date: string;
    tmax: number | null;
    tmin: number | null;
    tmean: number | null;
    rh: number | null;
    wind2m: number | null;
    solarMj: number | null;
    rainMm: number | null;
    et0Mm: number | null;
  }[];
}

export interface ReadingRow {
  id: string;
  node: string;
  nodeId: string;
  sensor: string;
  ts: string;
  raw: number;
  value: number;
  unit: string;
  flag: string;
  provenance: string;
}

export interface ReadingsResponse {
  ok: boolean;
  count: number;
  provenance: string | null;
  readings: ReadingRow[];
}

export interface AlertRow {
  id: string;
  ts: string;
  rule: string;
  severity: string;
  message: string;
  acknowledged: boolean;
}

export interface SummaryResponse {
  ok: boolean;
  kpis: {
    moistureNow: { value: number | null; node: string | null; ts: string | null };
    soilTempNow: { value: number | null; node: string | null; ts: string | null };
    ecEceNow: { value: number | null; provenance: "measured" | null; ts: string | null };
    tmax7d: number | null;
    et0Today: number | null;
  };
  health: { status: string; topReason: string | null; evidence: { rule: string; status: string; text: string }[] };
  freshness: { source: string; lastUpdate: string | null; status: string; detail: string }[];
  nodes: { id: string; name: string; type: string; lat: number; lon: number; batteryV: number | null; rssi: number | null; lastSeen: string | null }[];
}

export interface BioResponse {
  ok: boolean;
  experimental: boolean;
  notice: string;
  sessions: {
    id: string;
    startedAt: string;
    endedAt: string | null;
    sampleRateHz: number;
    notes: string | null;
    markers: { ts: number; label: string }[];
    features: Record<string, number | null>;
    wave: number[] | null;
  }[];
}
