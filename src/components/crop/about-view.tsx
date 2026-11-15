"use client";

// About (spec 4.11) — team, challenge, datasets, links. Plus the loading screen.

import { VineWreath, CropMark, SectionCard } from "./ui-bits";
import { useCropStore } from "./store";

export function LoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <VineWreath size={130} />
      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Climate and Resource Optimization for Plants</p>
    </div>
  );
}

export default function AboutView() {
  const { nasaMeta, climateRows } = useCropStore();
  return (
    <div className="space-y-4">
      <SectionCard title="About C.R.O.P." subtitle="Climate and Resource Optimization for Plants">
        <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
          <CropMark size={36} />
          <p>
            C.R.O.P. helps a vegetable farmer in Al Ain, UAE decide which crop to plant next. It combines real NASA Earth data (NASA POWER weather, GIBS vegetation
            imagery) with low-cost ESP32 field sensors, then ranks crop options with RotationIQ — an explainable, rule-based engine.
          </p>
          <p>
            <b className="text-foreground">Challenge:</b> NASA Space Apps 2026 — “Field Shift: Adapting Farms with NASA Data”. Case study: a one-acre vegetable farm
            (24.21 N, 55.76 E, ≈270 m elevation).
          </p>
          <p>
            <b className="text-foreground">Datasets:</b> NASA POWER Daily ({"4,300+".replace("4,300+", String(climateRows.length ?? 4300))} cached daily rows, {nasaMeta ? `${nasaMeta.start.slice(0, 4)}–${nasaMeta.end.slice(0, 4)}` : "2015→present"}), NASA GIBS MODIS/Terra NDVI, Esri World Imagery,
            and the FAO-56 / FAO-29 standards behind the crop parameters. Landsat field NDVI and UAE FGIC soil maps are honestly marked not connected.
          </p>
          <p>
            <b className="text-foreground">Principles:</b> honest provenance on every number (MEASURED / ESTIMATED / SIMULATED), deterministic and explainable scoring,
            no invented results, and full offline operation from the cached NASA series.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Links">
        <ul className="space-y-1.5 text-xs">
          <li><a className="text-info underline" href="https://power.larc.nasa.gov/docs/services/api/temporal/daily/" target="_blank" rel="noreferrer">NASA POWER Daily API documentation</a></li>
          <li><a className="text-info underline" href="https://www.fao.org/4/X0490E/x0490e00.htm" target="_blank" rel="noreferrer">FAO-56 Crop evapotranspiration (the ET0 standard)</a></li>
          <li><a className="text-info underline" href="https://www.fao.org/4/t0234e/t0234e00.htm" target="_blank" rel="noreferrer">FAO-29 Water Quality for Agriculture (salinity thresholds)</a></li>
          <li><a className="text-info underline" href="https://www.spaceappschallenge.com" target="_blank" rel="noreferrer">NASA Space Apps Challenge</a></li>
        </ul>
      </SectionCard>
    </div>
  );
}
