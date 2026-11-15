"use client";

// Zustand app store: navigation view, farm data, scenario lab state.

import { create } from "zustand";
import type { Scenario, Weights } from "@/lib/crop/types";
import type { FarmResponse, HealthResponse, NasaPowerMeta, SettingsResponse } from "./api";

export type ViewKey =
  | "overview"
  | "map"
  | "sensors"
  | "climate"
  | "rotationiq"
  | "health"
  | "economics"
  | "signals"
  | "methodology"
  | "settings"
  | "about"
  | "setup";

export type ClimateRow = { date: string; tmax: number | null; tmin: number | null; tmean: number | null; rh: number | null; wind2m: number | null; solarMj: number | null; rainMm: number | null; et0Mm: number | null };

export interface CropStore {
  booted: boolean;
  bootError: string | null;
  view: ViewKey;
  presentationMode: boolean;
  lightMode: boolean;
  // data
  farmName: string;
  dataMode: "demo" | "live";
  nasaMeta: NasaPowerMeta | null;
  climateStatus: "cached" | "live" | "unavailable";
  climateRows: ClimateRow[];
  farm: FarmResponse["farm"] | null;
  weights: Weights;
  scenario: Scenario;
  appSettings: SettingsResponse["settings"] | null;
  measuredEce: { ece: number | null; n: number } | null;
  deviceApiKeys: SettingsResponse["deviceApiKeys"];
  // actions
  setView: (v: ViewKey) => void;
  togglePresentation: () => void;
  toggleLight: () => void;
  setScenario: (patch: Partial<Scenario>) => void;
  setWeights: (patch: Partial<Weights>) => void;
  boot: () => Promise<void>;
  refreshClimate: () => Promise<{ ok: boolean; message?: string }>;
  refreshSettings: () => Promise<void>;
}

export const useCropStore = create<CropStore>((set, get) => ({
  booted: false,
  bootError: null,
  view: "overview",
  presentationMode: false,
  lightMode: false,
  farmName: "Al Ain farm",
  dataMode: "demo",
  nasaMeta: null,
  climateStatus: "unavailable",
  climateRows: [],
  farm: null,
  weights: { water: 0.25, salinity: 0.3, heat: 0.2, rotation: 0.25 },
  scenario: { tempDeltaC: 0, waterAvailabilityPct: 100, salinitySource: "measured", salinityStressDsm: 0, ecOverrideDsm: null },
  appSettings: null,
  measuredEce: null,
  deviceApiKeys: [],

  setView: (v) => set({ view: v }),
  togglePresentation: () => set({ presentationMode: !get().presentationMode }),
  toggleLight: () => set({ lightMode: !get().lightMode }),
  setScenario: (patch) => set({ scenario: { ...get().scenario, ...patch } }),
  setWeights: (patch) => set({ weights: { ...get().weights, ...patch } }),

  refreshSettings: async () => {
    const s = await fetch("/api/v1/settings").then((r) => r.json()) as SettingsResponse;
    set({
      weights: s.weights,
      scenario: s.scenario,
      appSettings: s.settings,
      dataMode: s.dataMode,
      deviceApiKeys: s.deviceApiKeys,
      measuredEce: s.measuredEce ?? null,
    });
  },

  boot: async () => {
    try {
      const settings = (await fetch("/api/v1/settings").then((r) => r.json())) as SettingsResponse;
      const climate = (await fetch("/api/v1/climate").then((r) => r.json())) as { ok: boolean; status: string; rows: CropStore["climateRows"]; meta: Record<string, unknown> };
      const farm = (await fetch("/api/v1/farm").then((r) => r.json()).catch(() => null)) as FarmResponse | null;
      set({
        booted: true,
        bootError: null,
        weights: settings.weights,
        scenario: settings.scenario,
        appSettings: settings.settings,
        dataMode: settings.dataMode,
        deviceApiKeys: settings.deviceApiKeys,
        measuredEce: settings.measuredEce ?? null,
        climateRows: climate.rows ?? [],
        climateStatus: climate.status === "cached" ? "cached" : "unavailable",
        nasaMeta: (climate.meta as unknown as NasaPowerMeta) ?? null,
        farm: farm?.ok ? farm.farm : null,
        farmName: farm?.ok ? farm.farm.name : "Al Ain farm",
      });
    } catch (e) {
      set({ booted: true, bootError: (e as Error).message });
    }
  },

  refreshClimate: async () => {
    try {
      const res = (await fetch("/api/v1/climate/refresh", { method: "POST" }).then((r) => r.json())) as { ok: boolean; rowsUpserted?: number; message?: string };
      const climate = (await fetch("/api/v1/climate").then((r) => r.json())) as { rows: CropStore["climateRows"]; meta: Record<string, unknown>; status: string };
      set({
        climateRows: climate.rows ?? [],
        climateStatus: res.ok ? "live" : get().climateStatus,
        nasaMeta: (climate.meta as unknown as NasaPowerMeta) ?? null,
      });
      return { ok: res.ok, message: res.ok ? `${res.rowsUpserted} rows refreshed from NASA POWER` : res.message };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  },
}));
