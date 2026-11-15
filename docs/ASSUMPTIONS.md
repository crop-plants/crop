# ASSUMPTIONS.md

Everything the spec left open, resolved with the simplest honest option
(spec section 13: "choose the simplest option that keeps the data honest").

## Stack substitution

- **Spec asked for React+Vite+FastAPI+SQLAlchemy.** The production environment here is
  **Next.js 16 (App Router) + TypeScript + Prisma/SQLite on bun**. All functional
  requirements are preserved: REST API under `/api/v1/*`, SQLite storage, deterministic
  engine in `src/lib/crop/`, and Zustand for client state.
- **Single visible route.** The sandbox gateway only exposes `/`, so navigation is a
  client-side view switch (Zustand), not URL routing. API routes are unaffected.

## Scientific choices

- **FAO-56 Penman-Monteith (Eq. 6)** is used because NASA POWER provides RH2M, WS2M and
  ALLSKY_SFC_SW_DWN. Validated against FAO-56 Example 18 (Uccle, 6 July): ET0 = 3.9 mm/day
  within 0.1. Inputs verified from the FAO-56 text (Tmax 21.5, Tmin 12.3, Tmean 16.9,
  Δ 0.122, es 1.997, Ra 41.09).
- **Crop parameters.** Salinity thresholds (a) come from the FAO-29 "crop tolerance and yield
  potential" table, checked against the FAO source on 2026-11-15
  (fao.org/4/t0234e/t0234e03.htm). Slopes (b) are the Maas–Hoffman values tabulated with
  FAO-29; where the table columns imply a slightly different slope (rounding), the published
  value is kept and the derivation shown. Kc values come from FAO-56 Table 12
  (fao.org/4/X0490E/x0490e0b.htm); stage lengths are single values selected inside the
  Table 12 ranges. **Eggplant and cowpea Kc values are VERIFY** (not in the fetched table);
  **melon a/b are VERIFY** (not located in the fetched FAO-29 table). Heat limits and sowing
  windows are modelling assumptions (VERIFY) — see the in-app Methodology table.
- **"Green bean / cowpea" was split** into two crops: green bean (a=1.0, CONFIRMED) and
  cowpea (a=4.9, CONFIRMED) — they have very different salt tolerances.
- **Season windows** are six months: cool Oct 1–Mar 31, warm Apr 1–Sep 30; horizon > 1
  alternates cool→warm→cool (custom start advances 6 months). Growth windows are capped at
  the window length.
- **Climatology** is the mean per calendar day (MM-DD) across 2015–2026 (12 years); a day
  with no observation is missing for that crop-window (the 60 % coverage rule then excludes
  the crop rather than inventing data).
- **Measured ECe** = median of the last 7 days of usable (flag=ok) soil-node EC readings
  × texture factor (2.2 for sandy loam, editable, with a "calibrate against a lab ECe test"
  banner). Regional estimate = 1.5 × irrigation-water EC (editable factor).
- **Status chips**: Recommended ≥ 70, Possible ≥ 50, Risky < 50, Excluded = any hard rule.
  Baseline for the rank-delta arrows = neutral scenario (0 °C, 100 % water, 0 stress).
- **RotationIQ runs client-side** (the engine is pure TypeScript) so slider changes re-rank
  in <10 ms; the same engine is exposed at `POST /api/v1/rotationiq/run` and every run there
  is persisted to `scenario_run`.

## Demo data

- **Only field sensors are simulated.** 120 days at 10-min cadence for 3 soil nodes + a
  station; every row carries `provenance="simulated"`. NASA POWER rows are the real API data.
- The generator includes: irrigation pulses, slow EC build-up (~+16 % over the last week on
  Node 1), an 8-hour stuck moisture fault on Node 2 (38 h ago), one out-of-range spike and a
  4-hour offline gap on Node 3. The seeded readings are passed through the **same
  `flagSeries` quality rules as live ingests**, so stuck/out-of-range/suspect readings are
  flagged and excluded identically.
- The irrigation pulse shape triggers the jump detector on a small share of samples
  (~0.9 %) — they are flagged `suspect` and excluded; this is the rule behaving as written,
  not an error.

## Map layers

- **NDVI overlay** = NASA GIBS MODIS/Terra NDVI 8-day WMTS (public, no key), max zoom 9 —
  regional context, labelled ESTIMATED. The pixel inspector reads the rendered tile colour and
  reports the nearest ramp class — an ESTIMATED class, not a pixel-exact product.
- **Salinity classes** are a labelled SIMULATED placeholder (spec allows this when no official
  dataset is accessible); they are never used in scoring.
- **Moisture surface** = inverse-distance-weighted interpolation of the latest usable node
  readings, labelled MEASURED (interpolated).
- Simplifications vs the spec: no swipe-compare divider, no measure tool, no offline tile
  cache (the map needs network for imagery; all data screens work fully offline).
- **Field NDVI time series** (Landsat) is honestly marked "not connected" — it requires
  Earthdata credentials and offline raster processing that cannot run here.

## Economics

- AED defaults from the spec (subtotal 1,679 + contingency 15 % + solar 540 = one-off;
  annualised ≈ AED 1,400–1,600 depending on the solar toggle). All fields editable.
- The water-price helper computes only the **percentage reduction needed to break even**;
  no savings are pre-filled or claimed.

## Known gaps (honest list)

- Playwright smoke suite, ingest rate limiting, and the nightly scheduler are not
  implemented in this environment; NASA refresh is available via the button and
  `POST /api/v1/climate/refresh` (an external cron can call it).
- The ESP32 firmware here is a documented reference sketch (see `docs/FIRMWARE.md`), not a
  PlatformIO project with hardware-in-the-loop tests.
- Arabic/RTL is not wired (stretch goal in the spec).
- MQTT transport for sensors is not implemented; HTTP ingest (spec 9.1) is implemented and
  tested end-to-end.
