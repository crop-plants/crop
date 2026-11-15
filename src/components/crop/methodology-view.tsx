"use client";

// Methodology (spec 4.9) — how it works and how to trust it: data sources,
// formulas, assumptions with VERIFY/CONFIRMED status, limitations, AI statement.

import { SectionCard, ProvenanceBadge } from "./ui-bits";
import { CROPS } from "@/lib/crop/data/crops";
import { useCropStore } from "./store";

const DATA_SOURCES = [
  { dataset: "NASA POWER Daily (community AG)", resolution: "≈0.5° × 0.625° grid", variables: "T2M, T2M_MAX, T2M_MIN, RH2M, WS2M, ALLSKY_SFC_SW_DWN, PRECTOTCORR", changes: "Drives ET0, the heat rules and every climatology window", status: "cached (real retrieval)", url: "https://power.larc.nasa.gov/api/temporal/daily/point" },
  { dataset: "NASA GIBS MODIS/Terra NDVI 8-day", resolution: "250 m/px", variables: "NDVI raster", changes: "Regional vegetation context on the map only — never a scoring input", status: "live WMTS", url: "https://gibs.earthdata.nasa.gov" },
  { dataset: "Landsat 8/9 surface reflectance", resolution: "30 m, 16-day", variables: "field-mean NDVI series", changes: "Not connected — needs Earthdata credentials; no values are fabricated", status: "not connected" },
  { dataset: "UAE FGIC soil maps", resolution: "—", variables: "salinity classes", changes: "No public programmatic access; map layer is a labelled SIMULATED placeholder", status: "not connected" },
  { dataset: "ESP32 field sensors", resolution: "10 min", variables: "moisture, soil temp, EC, air temp/RH", changes: "Feed KPIs, Field Health and the measured-ECe input of RotationIQ", status: "demo (SIMULATED)" },
  { dataset: "Esri World Imagery", resolution: "~1 m/px", variables: "satellite basemap", changes: "Field Map context only", status: "live tiles", url: "https://www.arcgis.com" },
];

const FORMULAS = [
  { name: "Reference ET0", text: "ET0 = [0.408·Δ·(Rn − G) + γ·(900/(T+273))·u2·(es − ea)] / [Δ + γ·(1 + 0.34·u2)]", note: "FAO-56 Eq. 6; Δ slope of vapour pressure curve (Eq. 13); γ psychrometric constant from elevation; es from Tmax/Tmin; ea = RHmean/100·es; Rns = (1−0.23)·Rs; Rnl per Eq. 39 with clear-sky Rso = (0.75+2e-5·z)·Ra. G = 0 for daily steps. Unit test: FAO-56 Example 18 (Uccle) → 3.9 mm/day within 0.1." },
  { name: "Crop water demand", text: "ETc = Kc(day) × ET0(day); seasonal net = Σ ETc; gross = net ÷ efficiency (drip 0.9, sprinkler 0.75, flood 0.6); 1 mm over 1 acre = 4.047 m³", note: "Kc curve by stage: constant Kc_ini, linear rise ini→mid, constant Kc_mid, linear mid→end." },
  { name: "Water fit", text: "ratio = available ÷ gross; s_water = min(1, ratio); excluded if ratio < 0.5", note: "Available = allowance × availability%." },
  { name: "Salinity (FAO-29)", text: "Yr% = 100 − b × (ECe − a) for ECe > a, floored at 0; s_salinity = Yr/100; excluded if Yr < 50", note: "ECe from the calibrated sensor (median of the last 7 usable days, × texture factor) or 1.5 × irrigation-water EC (regional estimate); user stress slider adds dS/m." },
  { name: "Heat", text: "heat_fraction = stress_days ÷ window_days (Tmax > crop limit); s_heat = clamp(1 − heat_fraction ÷ 0.4, 0, 1)", note: "Sowing-window rule excludes crops whose valid sowing months exclude the window start month." },
  { name: "Rotation", text: "start 1.0 · same family as previous season ×0.2 · same family two back ×0.6 · legume→heavy feeder +0.15 (cap 1) · new family in 3 seasons +0.1 (cap 1)", note: "Every applied rule is shown in the explanation drawer." },
  { name: "Overall", text: "Overall = 100 × (w_water·s_water + w_salinity·s_salinity + w_heat·s_heat + w_rotation·s_rotation)", note: "Defaults: salinity 0.30, water 0.25, rotation 0.25, heat 0.20 — documented assumptions, editable. Multi-season score = mean of season scores with the rotation term recomputed per season." },
];

const LIMITATIONS = [
  "NASA POWER is a ≈0.5° regional grid cell — a single field can differ; treat climate values as regional estimates, not farm measurements.",
  "Demo field sensors are SIMULATED; real ESP32 nodes post to /api/v1/ingest with an API key and are tagged measured.",
  "Heat limits, sowing windows and stage lengths are assumptions (VERIFY) — see the crop table below.",
  "Salinity maps for the UAE are not publicly accessible; the map layer is a SIMULATED placeholder and is never used in scoring.",
  "Scoring weights are assumptions, not fitted values; the sensitivity chart shows how much they matter.",
  "The ranking is an illustrative comparison — not an agronomically validated recommendation.",
  "No yield, income or profitability predictions are made anywhere in the app.",
];

export default function MethodologyView() {
  const { nasaMeta } = useCropStore();
  return (
    <div className="space-y-4">
      <SectionCard title="How C.R.O.P. works" subtitle="Every screen runs on the deterministic engine below — no language model decides any score.">
        <div className="space-y-2 text-xs leading-relaxed">
          <p>
            <b>Data flow:</b> official sources → retrieval & validation (−999 fill values removed; quality flags) → mathematical calculations → rule-based rotation engine → results.
            NASA rows are cached in SQLite with their retrieval date; sensor rows carry provenance (measured/simulated); every displayed number is traceable.
          </p>
          <p>
            <b>Data refresh:</b> NASA POWER cache fetched {nasaMeta ? `on ${new Date(nasaMeta.fetchedAt).toISOString().slice(0, 10)} for ${nasaMeta.start}–${nasaMeta.end}` : "—"} ({nasaMeta?.rowsTotal ?? "—"} rows); a refresh button re-queries the live API.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Data sources" subtitle="Dataset, resolution, variables and what each one changes.">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Dataset</th><th className="py-1.5 pr-3 font-medium">Resolution</th><th className="py-1.5 pr-3 font-medium">Variables</th><th className="py-1.5 pr-3 font-medium">What it changes</th><th className="py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {DATA_SOURCES.map((d) => (
                <tr key={d.dataset} className="border-b border-border/50 align-top">
                  <td className="py-2 pr-3 font-semibold">{d.dataset}{d.url ? <a className="ml-1 text-[10px] text-info underline" href={d.url} target="_blank" rel="noreferrer">link</a> : null}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{d.resolution}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{d.variables}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{d.changes}</td>
                  <td className="py-2"><ProvenanceBadge kind={d.status.includes("not connected") ? "unavailable" : d.status.includes("SIMULATED") ? "simulated" : "estimated"} /> <span className="text-[10px] text-muted-foreground">{d.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Formulas" subtitle="Symbols: Δ slope of vapour pressure curve; γ psychrometric constant; Ra extraterrestrial radiation; Rso clear-sky radiation.">
        <div className="space-y-2.5 text-[11px] leading-relaxed">
          {FORMULAS.map((f) => (
            <div key={f.name} className="rounded-lg border border-border p-3">
              <p className="font-semibold">{f.name}</p>
              <p className="mt-1 rounded bg-background/60 p-2 font-mono text-[10px]">{f.text}</p>
              <p className="mt-1 text-muted-foreground">{f.note}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Crop parameters — verification state" subtitle="Each value carries CONFIRMED (checked against the cited FAO source on 2026-11-15) or VERIFY (assumption requiring independent check).">
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 pr-2 font-medium">Crop</th>
                <th className="py-1.5 pr-2 font-medium">ECe a (dS/m)</th>
                <th className="py-1.5 pr-2 font-medium">Slope b</th>
                <th className="py-1.5 pr-2 font-medium">Kc ini/mid/end</th>
                <th className="py-1.5 pr-2 font-medium">Stages (d)</th>
                <th className="py-1.5 pr-2 font-medium">Heat Tmax</th>
                <th className="py-1.5 font-medium">Sow months</th>
              </tr>
            </thead>
            <tbody>
              {CROPS.map((c) => (
                <tr key={c.id} className="border-b border-border/40">
                  <td className="py-1.5 pr-2 font-semibold">{c.name}<span className="block text-[9px] font-normal text-muted-foreground">{c.family}</span></td>
                  <td className="py-1.5 pr-2">
                    <span className="num">{c.eceThreshold.value}</span> <StatusPill status={c.eceThreshold.status} />
                    {c.fao29Row ? <span className="num block text-[9px] text-muted-foreground">FAO row {c.fao29Row.ec100}/{c.fao29Row.ec90}/{c.fao29Row.ec75}/{c.fao29Row.ec50}</span> : null}
                  </td>
                  <td className="py-1.5 pr-2"><span className="num">{c.eceSlope.value}</span> <StatusPill status={c.eceSlope.status} /></td>
                  <td className="py-1.5 pr-2">
                    <span className="num">{c.kcIni.value}/{c.kcMid.value}/{c.kcEnd.value}</span> <StatusPill status={c.kcMid.status} />
                  </td>
                  <td className="py-1.5 pr-2"><span className="num">{c.stages.ini}/{c.stages.dev}/{c.stages.mid}/{c.stages.late}</span> <StatusPill status={c.stagesStatus} /></td>
                  <td className="py-1.5 pr-2"><span className="num">{c.heatLimitTmax.value}°C</span> <StatusPill status={c.heatLimitTmax.status} /></td>
                  <td className="py-1.5"><span className="num">{c.sowMonths.join(",")}</span> <StatusPill status={c.sowMonthsStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          CONFIRMED salinity values were checked against the FAO-29 “crop tolerance and yield potential” table (fao.org/4/t0234e/t0234e03.htm) on 2026-11-15; slopes are the
          Maas–Hoffman values tabulated with FAO-29 (cross-checked against the table columns within rounding). CONFIRMED Kc values come from FAO-56 Table 12
          (fao.org/4/X0490E/x0490e0b.htm). Stage lengths were selected within the Table 12 ranges. Heat limits and sowing windows are modelling assumptions (VERIFY).
        </p>
      </SectionCard>

      <SectionCard title="Known limitations">
        <ul className="list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-muted-foreground">
          {LIMITATIONS.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      </SectionCard>

      <SectionCard title="AI-use statement">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Language models were used only to help write the code and documentation of this project. All scoring, ranking, thresholds and calculations are deterministic
          formulas implemented in <code>src/lib/crop/</code> and covered by unit tests (<code>bun test</code>: FAO-56 Example 18, salinity response, water accounting,
          rotation rules, sensor-quality rules, climatology). No model generates, estimates or fills any scientific value at runtime.
        </p>
      </SectionCard>

      <SectionCard title="Version and changelog">
        <div className="text-[11px] leading-relaxed text-muted-foreground">
          <p className="font-semibold text-foreground">C.R.O.P. v1.0 — NASA Space Apps 2026, challenge “Field Shift: Adapting Farms with NASA Data”</p>
          <p className="mt-1">• 2026-11-15 — initial release: NASA POWER cache (2015→present), RotationIQ engine, Field Map, sensors pipeline, methodology page.</p>
        </div>
      </SectionCard>
    </div>
  );
}

function StatusPill({ status }: { status: "confirmed" | "verify" }) {
  return (
    <span className={status === "confirmed" ? "rounded bg-ok/15 px-1 py-0.5 text-[8px] font-bold uppercase text-ok" : "rounded bg-watch/15 px-1 py-0.5 text-[8px] font-bold uppercase text-watch"}>
      {status}
    </span>
  );
}
