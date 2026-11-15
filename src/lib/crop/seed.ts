// Demo data generator (spec section 10). ONLY field sensors are simulated and
// every simulated row is tagged provenance="simulated". NASA POWER rows are the
// real cached API data — never fabricated here.

import { db } from "@/lib/db";
import { createHash, randomUUID } from "node:crypto";
import { flagSeries } from "./quality";
import type { SensorKind } from "./types";

export const DEMO_FARM = {
  name: "Al Ain Case Study Farm",
  lat: 24.21,
  lon: 55.76,
  elevationM: 258, // NASA POWER grid-cell elevation for this point
  areaAcres: 1,
  soilTexture: "sandy loam",
  waterEcDsm: 1.6, // typical Al Ain well water (user-editable)
  irrigationAllowanceM3PerAcre: 3500,
  irrigationMethod: "drip" as const,
  cropHistory: [
    { seasonLabel: "Cool 2024-25", cropId: "lettuce" },
    { seasonLabel: "Warm 2025", cropId: "cucumber" },
    { seasonLabel: "Cool 2025-26", cropId: "tomato" },
  ],
  polygonGeojson: {
    type: "Polygon" as const,
    coordinates: [
      [
        [55.75969, 24.20971],
        [55.76031, 24.20971],
        [55.76031, 24.21029],
        [55.75969, 24.21029],
        [55.75969, 24.20971],
      ],
    ],
  },
};

export const DEFAULT_WEIGHTS = { water: 0.25, salinity: 0.3, heat: 0.2, rotation: 0.25 };
export const DEFAULT_SETTINGS = {
  moistureStressThresholdPct: 22,
  offlineIntervalLimit: 3,
  ec15ToEceFactor: 2.2, // sandy loam (editable; calibrate against a lab ECe test)
  ecwToEce: 1.5,
  selectedCropId: "tomato",
  language: "en",
};

// deterministic PRNG so the demo is reproducible
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

interface NodeSpec {
  name: string;
  type: "soil_node" | "station";
  lat: number;
  lon: number;
  apiKey: string;
}

const NODE_SPECS: NodeSpec[] = [
  { name: "Node 1", type: "soil_node", lat: 24.2101, lon: 55.7598, apiKey: "crop-demo-node-1" },
  { name: "Node 2", type: "soil_node", lat: 24.2103, lon: 55.7601, apiKey: "crop-demo-node-2" },
  { name: "Node 3", type: "soil_node", lat: 24.2099, lon: 55.7603, apiKey: "crop-demo-node-3" },
  { name: "Station", type: "station", lat: 24.21, lon: 55.76, apiKey: "crop-demo-station" },
];

const CALIBRATIONS: Record<string, { sensor: SensorKind; method: string; coefficients: Record<string, number | string> }[]> = {
  "Node 1": [
    { sensor: "moisture", method: "two_point", coefficients: { dryRaw: 2950, wetRaw: 750, dryValue: 0, wetValue: 52, unit: "%VWC" } },
    { sensor: "ec", method: "one_point", coefficients: { rawAtStandard: 912, standardValue: 1.413, unit: "dS/m (1:5 extract basis)" } },
    { sensor: "soil_temp", method: "factory", coefficients: { offset: 0.0 } },
  ],
  "Node 2": [
    { sensor: "moisture", method: "two_point", coefficients: { dryRaw: 2980, wetRaw: 770, dryValue: 0, wetValue: 50, unit: "%VWC" } },
    { sensor: "ec", method: "one_point", coefficients: { rawAtStandard: 905, standardValue: 1.413, unit: "dS/m (1:5 extract basis)" } },
  ],
  "Node 3": [
    { sensor: "moisture", method: "two_point", coefficients: { dryRaw: 2960, wetRaw: 745, dryValue: 0, wetValue: 51, unit: "%VWC" } },
    { sensor: "ec", method: "one_point", coefficients: { rawAtStandard: 918, standardValue: 1.413, unit: "dS/m (1:5 extract basis)" } },
  ],
  Station: [
    { sensor: "ec", method: "one_point", coefficients: { rawAtStandard: 910, standardValue: 1.413, unit: "dS/m (1:5 extract basis)" } },
    { sensor: "air_temp", method: "factory", coefficients: { offset: 0.0 } },
    { sensor: "air_rh", method: "factory", coefficients: { offset: 0.0 } },
  ],
};

export interface SeedResult {
  ok: boolean;
  farmId: string;
  readings: number;
  nodes: number;
  alerts: number;
  simulated: true;
}

/** Wipe demo entities and regenerate everything. */
export async function seedDemoData(): Promise<SeedResult> {
  // Clean slate for demo-owned tables (settings/climate preserved)
  await db.reading.deleteMany();
  await db.alert.deleteMany();
  await db.calibration.deleteMany();
  await db.referenceSample.deleteMany();
  await db.bioSession.deleteMany();
  await db.scenarioRun.deleteMany();
  await db.node.deleteMany();
  await db.farm.deleteMany();
  await db.ndviObs.deleteMany();

  const farm = await db.farm.create({
    data: {
      name: DEMO_FARM.name,
      lat: DEMO_FARM.lat,
      lon: DEMO_FARM.lon,
      elevationM: DEMO_FARM.elevationM,
      polygonGeojson: JSON.stringify(DEMO_FARM.polygonGeojson),
      soilTexture: DEMO_FARM.soilTexture,
      waterEcDsm: DEMO_FARM.waterEcDsm,
      irrigationAllowanceM3PerAcre: DEMO_FARM.irrigationAllowanceM3PerAcre,
      irrigationMethod: DEMO_FARM.irrigationMethod,
      cropHistory: JSON.stringify(DEMO_FARM.cropHistory),
      weightsJson: JSON.stringify(DEFAULT_WEIGHTS),
      dataMode: "demo",
    },
  });

  const keysForSettings: { nodeId: string; name: string; key: string }[] = [];
  const created: Record<string, { id: string }> = {};
  for (const spec of NODE_SPECS) {
    const node = await db.node.create({
      data: {
        farmId: farm.id,
        name: spec.name,
        type: spec.type,
        lat: spec.lat,
        lon: spec.lon,
        apiKeyHash: sha256(spec.apiKey),
        batteryV: 3.9,
        rssi: -62,
        lastSeen: new Date(),
      },
    });
    created[spec.name] = node;
    keysForSettings.push({ nodeId: node.id, name: spec.name, key: spec.apiKey });
    for (const cal of CALIBRATIONS[spec.name]) {
      await db.calibration.create({
        data: {
          nodeId: node.id,
          sensor: cal.sensor,
          method: cal.method,
          coefficientsJson: JSON.stringify({ ...cal.coefficients, calibratedDaysAgo: 21 }),
        },
      });
    }
  }
  await db.setting.upsert({
    where: { key: "deviceApiKeys" },
    create: { key: "deviceApiKeys", valueJson: JSON.stringify(keysForSettings) },
    update: { valueJson: JSON.stringify(keysForSettings) },
  });

  // ---- 120 days of 10-minute readings (SIMULATED) ----
  const rnd = mulberry32(42);
  const now = new Date();
  now.setUTCSeconds(0, 0);
  const start = new Date(now.getTime() - 120 * 86400000);
  const STEP = 10 * 60000;
  const N = Math.floor((now.getTime() - start.getTime()) / STEP); // ~17,280 samples
  const faultStartIdx = N - Math.round(38 * 3600000 / STEP); // stuck begins 38 h ago
  const faultEndIdx = faultStartIdx + Math.round(8 * 3600000 / STEP); // 8 h stuck

  type Row = {
    nodeId: string; ts: Date; sensor: string; rawValue: number; value: number;
    unit: string; qualityFlag: string; provenance: string;
  };
  const batch: Row[] = [];
  const push = (nodeId: string, ts: Date, sensor: string, raw: number, value: number, unit: string, flag = "ok") =>
    batch.push({ nodeId, ts, sensor, rawValue: Math.round(raw * 1000) / 1000, value: Math.round(value * 1000) / 1000, unit, qualityFlag: flag, provenance: "simulated" });

  // day index and time of day helpers
  for (let i = 0; i < N; i++) {
    const ts = new Date(start.getTime() + i * STEP);
    const dayIdx = Math.floor(i * STEP / 86400000);
    const hour = ts.getUTCHours() + ts.getUTCMinutes() / 60;
    const diurnal = Math.sin(((hour - 9) / 24) * 2 * Math.PI); // peaks mid-afternoon
    const irrigation = hour % 12 < 0.35 ? 6 : 0; // drip pulses morning/evening
    const stuck = i >= faultStartIdx && i < faultEndIdx;

    for (const spec of NODE_SPECS) {
      const node = created[spec.name];
      const nid = node.id;
      const jitter = () => (rnd() - 0.5);
      if (spec.type === "soil_node") {
        // moisture: base 30, diurnal swing, irrigation pulses, slow seasonal dry-down
        let m = 30 + 3 * diurnal + irrigation - dayIdx * 0.02 + jitter() * 0.8;
        if (spec.name === "Node 1" && dayIdx > 113) m += (dayIdx - 113) * 0.05; // slight wetting test
        let flag = "ok";
        if (stuck && spec.name === "Node 2") m = 27.4;
        if (spec.name === "Node 3" && i === N - 2 * 144) { m = 102; flag = "out_of_range"; }
        const raw = 2950 - (m / 52) * (2950 - 750);
        push(nid, ts, "moisture", raw, Math.max(0, m), "%", flag);
        const st = 26 + 4 * diurnal - dayIdx * 0.01 + jitter() * 0.3;
        push(nid, ts, "soil_temp", st, st, "°C");
        // EC (1:5 basis): 1.55 base + slow build-up + faster rise last 7 days + dips after irrigation
        let ec = 1.5 + dayIdx * 0.0016 + jitter() * 0.04;
        if (irrigation) ec -= 0.05;
        if (dayIdx > 113) ec += (dayIdx - 113) * 0.055; // ~+16% over the last week
        if (stuck && spec.name === "Node 2") ec = 1.55 + dayIdx * 0.0016; // fault freezes? no, EC keeps working
        const ecRaw = ec * 645; // inverse of calibration 912->1.413
        push(nid, ts, "ec", ecRaw, ec, "dS/m");
      } else {
        const at = 33 + 5 * diurnal + jitter() * 0.5;
        const rh = 45 - 15 * diurnal + jitter() * 2;
        push(nid, ts, "air_temp", at, at, "°C");
        push(nid, ts, "air_rh", rh, Math.max(5, rh), "%");
        const ec = 1.45 + dayIdx * 0.0013 + jitter() * 0.03;
        push(nid, ts, "ec", ec * 645, ec, "dS/m");
      }
    }
  }

  // offline gap on Node 3 five days ago (4 h missing)
  const gapStartIdx = N - 5 * 144;
  for (let i = batch.length - 1; i >= 0; i--) {
    const r = batch[i];
    if (r.nodeId === created["Node 3"].id) {
      const idx = Math.floor((r.ts.getTime() - start.getTime()) / STEP);
      if (idx >= gapStartIdx && idx < gapStartIdx + 24) batch.splice(i, 1);
    }
  }

  // ---- run the real quality rules per (node, sensor) stream ----
  // Stuck / out-of-range / suspect readings are flagged exactly like live
  // ingests, so the health rules and exclusions behave identically in demo.
  const streams = new Map<string, Row[]>();
  for (const r of batch) {
    const k = `${r.nodeId}|${r.sensor}`;
    const arr = streams.get(k) ?? [];
    arr.push(r);
    streams.set(k, arr);
  }
  for (const [key, rows] of streams) {
    const sensor = key.split("|")[1] as SensorKind;
    const flags = flagSeries({ sensor, values: rows.map((r) => r.value) });
    rows.forEach((r, i) => {
      r.qualityFlag = flags[i];
    });
  }

  let readingCount = 0;
  const CHUNK = 4000;
  for (let i = 0; i < batch.length; i += CHUNK) {
    const chunk = batch.slice(i, i + CHUNK).map((r) => ({ ...r }));
    const res = await db.reading.createMany({ data: chunk });
    readingCount += res.count;
  }

  // ---- alerts (generated to match the seeded evidence) ----
  const alerts = [
    { ts: new Date(now.getTime() - 3 * 3600000), rule: "moisture_stress", severity: "watch", message: "Node 3 moisture below 22% stress threshold for 6.2 h — check irrigation" },
    { ts: new Date(now.getTime() - 30 * 3600000), rule: "sensor_reliability", severity: "watch", message: "Node 2 moisture sensor reading stuck for 8 h — 48 readings flagged and excluded" },
    { ts: new Date(now.getTime() - 1 * 86400000), rule: "ec_trend", severity: "watch", message: "Node 1 EC rising ~16% over 7 days (ECe now ≈ 4.3 dS/m)" },
    { ts: new Date(now.getTime() - 2 * 86400000), rule: "ec_limit", severity: "alert", message: "Measured ECe ≈ 3.9 dS/m exceeds the lettuce threshold (1.3 dS/m)" },
    { ts: new Date(now.getTime() - 5 * 86400000), rule: "offline", severity: "watch", message: "Node 3 offline for 24 intervals (4 h) — readings excluded" },
  ];
  for (const a of alerts) await db.alert.create({ data: a });

  // ---- reference samples (lab/handheld checks) ----
  const refs = [
    { sensor: "ec", ts: new Date(now.getTime() - 20 * 86400000), value: 3.6, note: "Lab ECe (saturated paste), plot by Station" },
    { sensor: "ec", ts: new Date(now.getTime() - 6 * 86400000), value: 3.9, note: "Handheld EC meter, 1:5 extract × texture factor" },
    { sensor: "ph", ts: new Date(now.getTime() - 9 * 86400000), value: 7.4, note: "pH kit on prepared soil-water sample" },
    { sensor: "moisture", ts: new Date(now.getTime() - 4 * 86400000), value: 28.5, note: "Gravimetric spot check, Node 1" },
  ];
  for (const r of refs) await db.referenceSample.create({ data: r });

  // ---- settings ----
  const settings: [string, unknown][] = [
    ["weights", DEFAULT_WEIGHTS],
    ["scenario", { tempDeltaC: 0, waterAvailabilityPct: 100, salinitySource: "measured", salinityStressDsm: 0, ecOverrideDsm: null }],
    ["appSettings", DEFAULT_SETTINGS],
    ["demoSeededAt", now.toISOString()],
    ["ndviStatus", { status: "not_connected", message: "Landsat field NDVI requires Earthdata credentials — regional GIBS NDVI layer available on the map" }],
    ["bioNotice", "Experimental module. Never used in recommendations."],
  ];
  for (const [k, v] of settings) {
    await db.setting.upsert({ where: { key: k }, create: { key: k, valueJson: JSON.stringify(v) }, update: { valueJson: JSON.stringify(v) } });
  }

  // ---- plant signals demo session (SIMULATED, experimental) ----
  const wave: number[] = [];
  for (let i = 0; i < 2400; i++) {
    const t = i / 240;
    let v = 12 + Math.sin(t * 0.8) * 1.5 + (rnd() - 0.5) * 2.2;
    if (Math.abs(t - 3) < 0.15) v += 18; // water stimulus response
    if (Math.abs(t - 6.2) < 0.12) v += 11; // touch
    wave.push(Math.round(v * 100) / 100);
  }
  await db.bioSession.create({
    data: {
      nodeId: created["Node 1"].id,
      startedAt: new Date(now.getTime() - 3600000),
      endedAt: now,
      sampleRateHz: 250,
      notes: "Demo session (SIMULATED). Electrodes on leaf petiole, INA128 + ADS1115.",
      markersJson: JSON.stringify([
        { ts: 3 * 4.8, label: "water" },
        { ts: 6.2 * 4.8, label: "touch" },
      ]),
      featuresJson: JSON.stringify({ baseline: 12.1, peakAmplitude: 18.2, responseLatencyS: 0.7, rmsNoise: 0.64, driftPerHour: 0.21 }),
      waveJson: JSON.stringify(wave),
    },
  });

  return { ok: true, farmId: farm.id, readings: readingCount, nodes: NODE_SPECS.length, alerts: alerts.length, simulated: true };
}

export function newApiKey(): string {
  return `crop-${randomUUID().slice(0, 12)}`;
}
