# C.R.O.P. — Climate and Resource Optimization for Plants

An agricultural decision-support web app for a one-acre vegetable farm in Al Ain, UAE
(NASA Space Apps 2026 — challenge *"Field Shift: Adapting Farms with NASA Data"*).

C.R.O.P. combines **real NASA Earth data** (NASA POWER daily weather, NASA GIBS
MODIS/Terra NDVI) with **low-cost ESP32 field sensors**, then ranks crop options with
**RotationIQ** — an explainable, fully deterministic rule-based engine. No language
model decides any score.

## Principles (non-negotiable)

1. **Honest data labelling** — every number carries a provenance badge:
   `MEASURED` (sensors, NASA observation) · `ESTIMATED` (regional maps, model outputs) ·
   `SIMULATED` (demo data, scenarios).
2. **Deterministic and explainable** — transparent formulas (FAO-56, FAO-29); the
   explanation drawer shows every formula with the actual numbers substituted.
3. **No invented results** — costs and a break-even threshold only; savings are never claimed.
4. **Experimental stays separate** — the plant bioelectric module never influences recommendations.
5. **Works offline** — the NASA POWER cache (4,337 real daily rows, 2015→2026-11-15) lives in
   SQLite; fill value −999 becomes null, never an interpolation.

## 5-minute quickstart

```bash
bun install
bunx prisma generate
bun run db:push        # creates db/custom.db (SQLite)
bun scripts/fetch-power.ts   # fetch REAL NASA POWER daily data for Al Ain (no key needed)
bun scripts/seed-demo.ts     # seed the Al Ain case study + SIMULATED sensor demo
bun test               # 22 unit tests incl. FAO-56 Example 18 validation
bun run dev            # http://localhost:3000
```

The first page load seeds nothing by itself — run the two scripts above (or press
**Load demo data** in the Setup wizard).

## Architecture

```
NASA POWER API ──► scripts/fetch-power.ts ──► climate_daily (SQLite, real rows)
NASA GIBS WMTS ──► Field Map NDVI layer (live tiles, no key)
Esri World Imagery ──► Field Map basemap (attribution shown)
ESP32 (HTTP POST, X-API-Key) ──► /api/v1/ingest ──► readings (provenance=measured)
Demo generator ─────────────────► readings (provenance=simulated, quality-flagged)

Next.js 16 (App Router, React 19, TypeScript, Tailwind 4, shadcn/ui)
├── src/lib/crop/          deterministic engine (no React, no DB)
│   ├── et0.ts             FAO-56 Penman-Monteith (unit test = FAO-56 Example 18)
│   ├── salinity.ts        FAO-29 relative-yield response
│   ├── water.ts           ETc accounting, irrigation efficiency
│   ├── rotation.ts        rotation rules (family/legume/history)
│   ├── engine.ts          RotationIQ: constraints → scores → sequences → sensitivity
│   ├── quality.ts         stuck / jump / out-of-range / offline rules
│   ├── field-health.ts    the three transparent Field Health rules
│   └── data/crops.ts      12 crops, per-value CONFIRMED/VERIFY + FAO sources
├── src/app/api/v1/        ingest, readings, climate(+refresh), rotationiq/run,
│                          alerts, farm, summary, settings, calibration, reference,
│                          bio, export, seed, health
└── src/components/crop/   11 client views (single / route), Zustand store
```

## The screens

Overview · Field Map (satellite, polygon, pins, GIBS NDVI time slider, pixel
inspector) · Sensors (charts, calibration, reference check, CSV) · Climate (NASA
charts, ET0, heat calendar, +°C scenarios) · **RotationIQ** (Scenario Lab, ranked
list, movement indicators, multi-season strategies, explanation drawer, PDF) ·
Field Health · Economics (AED, break-even) · Plant Signals (experimental) ·
Methodology (every assumption with VERIFY/CONFIRMED) · Settings · About · Setup wizard.

Keyboard: `Ctrl/Cmd + Shift + P` = presentation mode (hides all chrome for the demo video).

## Data sources & statuses

| Source | Status |
| --- | --- |
| NASA POWER Daily (community AG) | **connected** — real cached retrieval + live refresh |
| NASA GIBS MODIS/Terra NDVI 8-day | **connected** — live WMTS layer on the map |
| Esri World Imagery | **connected** — basemap tiles |
| ESP32 field sensors | **ingest ready** — demo values are SIMULATED |
| Landsat 8/9 field NDVI | not connected (needs Earthdata credentials) |
| UAE FGIC soil maps | not connected (no public programmatic access) |

## Docs

- [`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md) — every modelling choice and its justification
- [`docs/API.md`](docs/API.md) — the v1 API contract (ingest payload, RotationIQ run)
- [`docs/FIRMWARE.md`](docs/FIRMWARE.md) — ESP32 wiring + firmware sketch reference
- In-app **Methodology** page — formulas, sources, verification table, limitations, AI-use statement
