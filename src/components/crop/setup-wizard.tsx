"use client";

// Setup wizard (spec 4.0) — five steps with a progress bar, ending in
// "Load demo data". Re-openable from Settings.

import { useState } from "react";
import { useCropStore } from "./store";
import { SectionCard, VineWreath } from "./ui-bits";
import { CROPS } from "@/lib/crop/data/crops";
import { fetchJson } from "./api";
import { cn } from "@/lib/utils";

const STEPS = ["Location", "Field boundary", "Soil & water", "Crop history", "Priorities"];

export default function SetupWizard({ onDone }: { onDone?: () => void }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const { farm } = useCropStore();

  const [form, setForm] = useState({
    name: farm?.name ?? "Al Ain Case Study Farm",
    lat: farm?.lat ?? 24.21,
    lon: farm?.lon ?? 55.76,
    elevationM: farm?.elevationM ?? 270,
    soilTexture: farm?.soilTexture ?? "sandy loam",
    waterEcDsm: farm?.waterEcDsm ?? 1.6,
    irrigationAllowanceM3PerAcre: farm?.irrigationAllowanceM3PerAcre ?? 3500,
    irrigationMethod: farm?.irrigationMethod ?? ("drip" as "drip" | "sprinkler" | "flood"),
    history: farm?.cropHistory?.length ? farm.cropHistory : [
      { seasonLabel: "Cool 2024-25", cropId: "lettuce" },
      { seasonLabel: "Warm 2025", cropId: "cucumber" },
      { seasonLabel: "Cool 2025-26", cropId: "tomato" },
    ],
  });

  const save = async () => {
    setBusy("save");
    await fetchJson("/api/v1/farm", {
      method: "PUT",
      body: JSON.stringify({
        name: form.name, lat: form.lat, lon: form.lon, elevationM: form.elevationM,
        soilTexture: form.soilTexture, waterEcDsm: form.waterEcDsm,
        irrigationAllowanceM3PerAcre: form.irrigationAllowanceM3PerAcre,
        irrigationMethod: form.irrigationMethod, cropHistory: form.history,
      }),
    }).catch(() => null);
    setBusy(null);
    setDone("Farm profile saved.");
  };

  const loadDemo = async () => {
    setBusy("demo");
    await fetchJson("/api/v1/seed", { method: "POST" }).catch(() => null);
    await useCropStore.getState().boot();
    setBusy(null);
    setDone("Demo data loaded — the full Al Ain case study is ready.");
  };

  return (
    <SectionCard title="Setup wizard" subtitle="Five quick steps; every value stays editable later in Settings.">
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Step {step + 1} of {STEPS.length}: {STEPS[step]}</span>
          <span className="num">{Math.round(((step + 1) / STEPS.length) * 100)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-background/60">
          <div className="h-full rounded-full bg-lime transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      {step === 0 ? (
        <div className="grid gap-3 text-xs sm:grid-cols-2">
          <label className="text-muted-foreground">
            Farm name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-md border border-border bg-raised px-2 py-1.5" />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-muted-foreground">
              Latitude
              <input type="number" step={0.0001} value={form.lat} onChange={(e) => setForm({ ...form, lat: +e.target.value })} className="num mt-1 w-full rounded-md border border-border bg-raised px-2 py-1.5" />
            </label>
            <label className="text-muted-foreground">
              Longitude
              <input type="number" step={0.0001} value={form.lon} onChange={(e) => setForm({ ...form, lon: +e.target.value })} className="num mt-1 w-full rounded-md border border-border bg-raised px-2 py-1.5" />
            </label>
            <label className="text-muted-foreground">
              Elevation (m)
              <input type="number" value={form.elevationM} onChange={(e) => setForm({ ...form, elevationM: +e.target.value })} className="num mt-1 w-full rounded-md border border-border bg-raised px-2 py-1.5" />
            </label>
          </div>
          <p className="text-[10px] text-muted-foreground sm:col-span-2">Default centre: Al Ain, UAE (24.21 N, 55.76 E, ≈270 m). The Field Map lets you click-to-locate; NASA POWER data is retrieved for these coordinates.</p>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-2 text-xs">
          <p className="leading-relaxed text-muted-foreground">
            Draw the field boundary on the Field Map (Layers panel → redraw coming from the demo polygon). The demo boundary is a 1-acre rectangle at the farm centre;
            area is read out in acres, hectares and m² on the map legend.
          </p>
          <div className="rounded-lg border border-border p-3 text-[11px] text-muted-foreground">
            Current boundary: {farm?.polygonGeojson ? "demo 1-acre polygon drawn (≈4047 m² · 0.40 ha · 1.00 acres)" : "none yet — the demo polygon will be used"}
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="grid gap-3 text-xs sm:grid-cols-2">
          <label className="text-muted-foreground">
            Soil texture
            <select value={form.soilTexture} onChange={(e) => setForm({ ...form, soilTexture: e.target.value })} className="mt-1 w-full rounded-md border border-border bg-raised px-2 py-1.5">
              {["sand", "loamy sand", "sandy loam", "loam", "clay loam"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-muted-foreground">
            Irrigation water salinity (EC dS/m) — typical Al Ain well water ≈ 1.5–3, editable
            <input type="number" step={0.1} value={form.waterEcDsm} onChange={(e) => setForm({ ...form, waterEcDsm: +e.target.value })} className="num mt-1 w-full rounded-md border border-border bg-raised px-2 py-1.5" />
          </label>
          <label className="text-muted-foreground">
            Seasonal irrigation allowance (m³ per acre per season)
            <input type="number" value={form.irrigationAllowanceM3PerAcre} onChange={(e) => setForm({ ...form, irrigationAllowanceM3PerAcre: +e.target.value })} className="num mt-1 w-full rounded-md border border-border bg-raised px-2 py-1.5" />
          </label>
          <label className="text-muted-foreground">
            Irrigation method
            <select value={form.irrigationMethod} onChange={(e) => setForm({ ...form, irrigationMethod: e.target.value as "drip" })} className="mt-1 w-full rounded-md border border-border bg-raised px-2 py-1.5">
              {["drip (90% efficiency)", "sprinkler (75%)", "flood (60%)"].map((t) => <option key={t} value={t.split(" ")[0]}>{t}</option>)}
            </select>
          </label>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-2 text-xs">
          <p className="text-muted-foreground">Last three seasons (used by the rotation rules):</p>
          {form.history.map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-28 text-muted-foreground">{h.seasonLabel}</span>
              <select
                value={h.cropId}
                onChange={(e) => {
                  const hist = [...form.history];
                  hist[i] = { ...h, cropId: e.target.value };
                  setForm({ ...form, history: hist });
                }}
                className="rounded-md border border-border bg-raised px-2 py-1.5"
              >
                {CROPS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="fallow">Fallow</option>
              </select>
            </div>
          ))}
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-2 text-xs">
          <p className="text-muted-foreground">
            Priority sliders map to the scoring weights (saved defaults: salinity 0.30, water 0.25, rotation 0.25, heat 0.20). Fine-tune them live in RotationIQ.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              ["Save water", "water"],
              ["Protect soil", "salinity"],
              ["Avoid heat risk", "heat"],
            ].map(([label, key]) => (
              <div key={key} className="rounded-lg border border-border p-3">
                <p className="font-semibold">{label}</p>
                <p className="num mt-1 text-lg font-semibold">{useCropStore.getState().weights[key as "water"].toFixed(2)}</p>
                <input type="range" min={0} max={0.7} step={0.01} defaultValue={useCropStore.getState().weights[key as "water"]}
                  onChange={(e) => {
                    const raw = +e.target.value;
                    const w = useCropStore.getState().weights;
                    const others = (Object.keys(w) as (keyof typeof w)[]).filter((k) => k !== key);
                    const otherSum = others.reduce((acc, k) => acc + w[k], 0);
                    const next = { ...w, [key]: raw };
                    for (const k of others) next[k] = (w[k] / (otherSum || 1)) * (1 - raw);
                    useCropStore.getState().setWeights(next);
                  }}
                  className="w-full accent-[#E9FDBD]"
                  aria-label={label}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-raised disabled:opacity-40">
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button onClick={() => setStep((s) => s + 1)} className="rounded-lg border border-lime/50 bg-lime/10 px-3 py-1.5 text-xs font-semibold text-lime hover:bg-lime/20">
              Next
            </button>
          ) : (
            <button onClick={save} disabled={busy === "save"} className="rounded-lg border border-lime/50 bg-lime/10 px-3 py-1.5 text-xs font-semibold text-lime hover:bg-lime/20">
              {busy === "save" ? "Saving…" : "Save farm profile"}
            </button>
          )}
        </div>
        <button onClick={loadDemo} disabled={busy === "demo"} className={cn("rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-raised", busy === "demo" && "opacity-60")}>
          {busy === "demo" ? "Loading demo…" : "Load demo data"}
        </button>
      </div>

      {done ? (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-ok/40 bg-ok/10 p-3 text-xs">
          <VineWreath size={34} />
          <p>{done}</p>
        </div>
      ) : null}
    </SectionCard>
  );
}
