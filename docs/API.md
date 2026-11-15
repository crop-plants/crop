# C.R.O.P. API — v1

Base path: `/api/v1`. All responses are JSON. No API key is needed for reads;
writes to ingest require `X-API-Key`.

## Ingest (spec 9.1)

```
POST /api/v1/ingest
X-API-Key: crop-demo-node-1        # demo keys are listed in Settings
Content-Type: application/json

{
  "node_id": "Node 1",
  "ts": "2026-11-14T08:00:00Z",          // optional, default now
  "battery_v": 3.92,
  "rssi": -61,
  "readings": {
    "moisture_raw": 1810,
    "soil_temp_c": 27.4,
    "air_temp_c": 33.1,
    "air_rh": 28.0,
    "ec_raw": 912
  }
}
→ 202 { "ok": true, "stored": 5, "ts": "...", "note": "Raw and calibrated values stored; quality flags applied" }
```

Raw and converted values are both stored; `qualityFlag` is computed per reading
(ok / suspect / stuck / out_of_range); flagged readings are excluded from every
calculation but kept in the raw series. Node `lastSeen`, battery and RSSI update.

## Reads

- `GET /api/v1/readings?node=<id|name>&sensor=<kind>&from=<ISO>&to=<ISO>&max=<n>`
- `GET /api/v1/climate?from=YYYYMMDD&to=YYYYMMDD` — cached NASA POWER daily rows + metadata
- `GET /api/v1/summary` — KPIs, health verdict + evidence, freshness strip, nodes
- `GET /api/v1/alerts?limit=n` · `POST /api/v1/alerts {id} | {acknowledgedAll:true}`
- `GET /api/v1/farm` · `PUT /api/v1/farm`
- `GET /api/v1/settings` · `PUT /api/v1/settings {weights|appSettings|scenario|dataMode}`
- `GET /api/v1/calibration?node=` · `POST /api/v1/calibration {nodeName,sensor,method,coefficients}`
- `GET /api/v1/reference` (samples + MAE/bias/R²) · `POST /api/v1/reference {sensor,value,note}`
- `GET /api/v1/bio` (experimental sessions) · `POST /api/v1/bio {sampleRateHz,samples[],markers[]}`
- `GET /api/v1/export?node=&sensor=&from=&to=` — CSV download
- `GET /api/v1/health` — app + database + data status

## RotationIQ (spec 9.1)

```
POST /api/v1/rotationiq/run
{
  "horizon": 1,                     // 1 | 2 | 3
  "seasonKind": "cool",             // cool | warm | custom (+ customStartMonth)
  "startYear": 2026,
  "cropPool": ["tomato", ...],      // optional, defaults to all 12 crops
  "weights": { "water":0.25, "salinity":0.3, "heat":0.2, "rotation":0.25 }, // optional
  "scenario": { "tempDeltaC":0, "waterAvailabilityPct":100,
                "salinitySource":"measured", "salinityStressDsm":0, "ecOverrideDsm":null }
}
→ { "ok": true, "result": { "ranked": [CropScore...], "excluded": [...],
      "sequences": [...], "eceProvenance": "measured", "climatologyYears": 12, ... } }
```

CropScore carries: overall (0-100), four component scores, status chip, exact hard-fail
reasons, water demand series, salinity assessment (FAO-29 a/b with numbers), heat stats,
rotation rules applied, and a plain-language summary line. The UI uses the identical
engine client-side for <10 ms live re-ranking.

## Maintenance

- `POST /api/v1/climate/refresh` — re-fetch NASA POWER for the farm coordinates (real API, no key)
- `POST /api/v1/seed` — regenerate the demo dataset (simulated sensors only)
