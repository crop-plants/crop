"use client";

// RotationIQ — the core screen (spec 4.5). Left Scenario Lab, centre ranked
// results with movement indicators, right explanation drawer. Recomputation is
// client-side and deterministic (<300 ms); nothing here calls an LLM.

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowDown, ArrowRight, ArrowUp, Download, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { useCropStore } from "./store";
import { SectionCard, ProvenanceBadge, Skeleton, fmt } from "./ui-bits";
import { runRotationEngine, overallAcrossTemps, seasonWindows } from "@/lib/crop/engine";
import { buildClimatology } from "@/lib/crop/climatology";
import { CROPS, CROP_BY_ID } from "@/lib/crop/data/crops";
import type { CropScore, RotationRunResult, Weights } from "@/lib/crop/types";
import type { RunEngineInput } from "@/lib/crop/engine";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  recommended: "bg-ok/20 text-ok border-ok/50",
  possible: "bg-info/15 text-info border-info/40",
  risky: "bg-watch/15 text-watch border-watch/40",
  excluded: "bg-alert/15 text-alert border-alert/40",
};

const COMPONENT_COLORS: Record<string, string> = {
  water: "#8EC9E8",
  salinity: "#E5604D",
  heat: "#E3B341",
  rotation: "#6C9A52",
};

export default function RotationIQView() {
  const { farm, climateRows, measuredEce, weights, scenario, setScenario, setWeights, appSettings } = useCropStore();
  const [horizon, setHorizon] = useState<1 | 2 | 3>(1);
  const [seasonKind, setSeasonKind] = useState<"cool" | "warm" | "custom">("cool");
  const [customMonth, setCustomMonth] = useState(10);
  const [pool, setPool] = useState<string[]>(CROPS.map((c) => c.id));
  const [detail, setDetail] = useState<CropScore | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);

  const clim = useMemo(() => buildClimatology(climateRows ?? []), [climateRows]);
  const startYear = new Date().getUTCFullYear();

  // debounce 150 ms: snapshot the lab inputs, then recompute from the snapshot
  const [lab, setLab] = useState({ scenario, weights, pool, horizon, seasonKind, customMonth });
  const { scenario: labScenario, weights: labWeights, pool: labPool, horizon: labHorizon, seasonKind: labSeasonKind, customMonth: labCustomMonth } = lab;
  useEffect(() => {
    const t = setTimeout(() => setLab({ scenario, weights, pool, horizon, seasonKind, customMonth }), 150);
    return () => clearTimeout(t);
  }, [scenario, weights, pool, horizon, seasonKind, customMonth]);

  const runInput = useMemo(() => {
    if (!farm) return null;
    return {
      farm,
      daily: climateRows ?? [],
      params: {
        farm,
        scenario: labScenario,
        weights: labWeights,
        cropPool: labPool,
        horizon: labHorizon,
        seasonKind: labSeasonKind,
        customStartMonth: labCustomMonth,
        startYear,
      },
      measuredEceDsm: measuredEce?.ece ?? null,
      clim,
      cropPool: labPool,
      weights: labWeights,
    };
  }, [farm, climateRows, labScenario, labWeights, labPool, labHorizon, labSeasonKind, labCustomMonth, measuredEce, clim, startYear]);

  // baseline (neutral scenario) for rank-delta arrows
  const baseline = useMemo(() => {
    if (!farm) return null;
    const neutral = { ...labScenario, tempDeltaC: 0, waterAvailabilityPct: 100, salinityStressDsm: 0 };
    return runRotationEngine({
      farm,
      daily: climateRows ?? [],
      params: { farm, scenario: neutral, weights: labWeights, cropPool: labPool, horizon: 1, seasonKind: labSeasonKind, customStartMonth: labCustomMonth, startYear },
      measuredEceDsm: measuredEce?.ece ?? null,
      clim,
      cropPool: labPool,
      weights: labWeights,
    });
  }, [farm, climateRows, labScenario, labWeights, labPool, labSeasonKind, labCustomMonth, measuredEce, clim, startYear]);

  const result: RotationRunResult | null = useMemo(() => {
    if (!runInput) return null;
    return runRotationEngine(runInput);
  }, [runInput]);

  const baselineRank = useMemo(() => {
    const m = new Map<string, number>();
    baseline?.ranked.forEach((r, i) => m.set(r.cropId, i + 1));
    return m;
  }, [baseline]);
  const baselineOverall = useMemo(() => {
    const m = new Map<string, number>();
    baseline?.ranked.forEach((r) => m.set(r.cropId, r.overall));
    return m;
  }, [baseline]);

  if (!farm) return <Skeleton className="h-96" />;

  const ranked = result?.ranked.slice(0, 8) ?? [];
  const excluded = result?.excluded ?? [];

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      {/* ---------- Scenario Lab ---------- */}
      <div className="no-print space-y-4 xl:col-span-3">
        <SectionCard title="Scenario Lab" subtitle="Every change reruns the engine instantly — deterministic formulas, no AI.">
          <div className="space-y-4 text-sm">
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Season window</p>
              <div className="flex flex-wrap gap-1.5">
                {(["cool", "warm", "custom"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setSeasonKind(k)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs capitalize",
                      seasonKind === k ? "border-lime bg-lime/15 text-lime" : "border-border text-muted-foreground hover:bg-raised",
                    )}
                  >
                    {k === "cool" ? "Cool (Oct–Mar)" : k === "warm" ? "Warm (Apr–Sep)" : "Custom start"}
                  </button>
                ))}
              </div>
              {seasonKind === "custom" ? (
                <select
                  className="mt-2 w-full rounded-lg border border-border bg-raised px-2 py-1.5 text-xs"
                  value={customMonth}
                  onChange={(e) => setCustomMonth(+e.target.value)}
                >
                  {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => (
                    <option key={m} value={i + 1}>
                      Start {m}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Horizon</p>
              <div className="flex gap-1.5">
                {([1, 2, 3] as const).map((h) => (
                  <button
                    key={h}
                    onClick={() => setHorizon(h)}
                    className={cn("rounded-full border px-3 py-1 text-xs", horizon === h ? "border-lime bg-lime/15 text-lime" : "border-border text-muted-foreground hover:bg-raised")}
                  >
                    {h} season{h > 1 ? "s" : ""}
                  </button>
                ))}
              </div>
            </div>

            <Slider
              label={`Temperature change: ${scenario.tempDeltaC > 0 ? "+" : ""}${scenario.tempDeltaC.toFixed(1)} °C`}
              min={-2} max={4} step={0.5}
              value={scenario.tempDeltaC}
              onChange={(v) => setScenario({ tempDeltaC: v })}
              tip="Shifts Tmax and Tmean for every day before ET0 and heat stress are recomputed from the raw NASA series (SIMULATED scenario, labelled as such)."
            />
            <Slider
              label={`Water availability: ${scenario.waterAvailabilityPct}% of allowance`}
              min={50} max={120} step={5}
              value={scenario.waterAvailabilityPct}
              onChange={(v) => setScenario({ waterAvailabilityPct: v })}
              tip="Scales the seasonal irrigation allowance before the water-fit score is computed."
            />

            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Salinity source</p>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setScenario({ salinitySource: "measured" })}
                  className={cn("rounded-full border px-3 py-1 text-xs", scenario.salinitySource === "measured" ? "border-lime bg-lime/15 text-lime" : "border-border text-muted-foreground hover:bg-raised")}
                >
                  Measured EC {measuredEce?.ece != null ? `(${measuredEce.ece.toFixed(1)} dS/m)` : ""}
                </button>
                <button
                  onClick={() => setScenario({ salinitySource: "regional" })}
                  className={cn("rounded-full border px-3 py-1 text-xs", scenario.salinitySource === "regional" ? "border-lime bg-lime/15 text-lime" : "border-border text-muted-foreground hover:bg-raised")}
                >
                  Regional estimate ({(farm.waterEcDsm * 1.5).toFixed(1)} dS/m)
                </button>
              </div>
              <div className="mt-2 space-y-2">
                <Slider
                  label={`Extra salinity stress: +${scenario.salinityStressDsm.toFixed(1)} dS/m`}
                  min={0} max={3} step={0.1}
                  value={scenario.salinityStressDsm}
                  onChange={(v) => setScenario({ salinityStressDsm: v })}
                  tip="Adds to the ECe used by every crop before the FAO-29 yield response is applied."
                />
                <label className="block text-xs text-muted-foreground">
                  Irrigation-water EC override (dS/m):
                  <input
                    type="number" step={0.1} min={0} max={30}
                    value={scenario.ecOverrideDsm ?? ""}
                    placeholder={`${farm.waterEcDsm}`}
                    onChange={(e) => setScenario({ ecOverrideDsm: e.target.value === "" ? null : +e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-raised px-2 py-1.5 text-xs"
                  />
                </label>
              </div>
            </div>

            <div>
              <p className="mb-1.5 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Priorities (weights)
                <button onClick={() => setWeights({ water: 0.25, salinity: 0.3, heat: 0.2, rotation: 0.25 })} className="inline-flex items-center gap-1 normal-case text-[10px] hover:text-lime">
                  <RotateCcw className="h-3 w-3" /> Reset
                </button>
              </p>
              <WeightSliders weights={weights} onChange={(patch) => setWeights(patch)} />
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Crop pool</p>
              <div className="flex flex-wrap gap-1.5">
                {CROPS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setPool((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]))}
                    className={cn("rounded-full border px-2.5 py-1 text-[11px]", pool.includes(c.id) ? "border-sage/60 bg-sage/10 text-foreground" : "border-border text-muted-foreground opacity-60")}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ---------- Results ---------- */}
      <div className="space-y-4 xl:col-span-6">
        <SectionCard
          title={`Ranked crops — first season (${result?.ranked[0]?.seasonLabel ?? "—"})`}
          subtitle={`All ${CROPS.length} pool crops evaluated in ${result?.computedAtMs ?? 0} ms from ${result?.climatologyYears ?? "—"} years of NASA POWER history. Illustrative comparison — not an agronomically validated recommendation.`}
          right={<SlidersHorizontal className="h-4 w-4 text-muted-foreground" />}
        >
          {result === null ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {ranked.map((row, idx) => (
                  <motion.button
                    layout
                    key={row.cropId}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                    onClick={() => setDetail(row)}
                    className="card-raised w-full p-3 text-left hover:border-sage/50"
                  >
                    <RankedRow row={row} rank={idx + 1} baseRank={baselineRank.get(row.cropId)} baseOverall={baselineOverall.get(row.cropId)} />
                  </motion.button>
                ))}
              </AnimatePresence>
              {ranked.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No crop passes all hard rules in this scenario — open the excluded list to see the exact blockers.</p>
              ) : null}

              <button onClick={() => setShowExcluded((s) => !s)} className="mt-2 flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-raised">
                <span>Excluded crops ({excluded.length}) — exact reasons</span>
                <ArrowRight className={cn("h-3.5 w-3.5 transition-transform", showExcluded && "rotate-90")} />
              </button>
              {showExcluded ? (
                <div className="space-y-1.5">
                  {excluded.map((x) => (
                    <button key={x.cropId} onClick={() => setDetail(x)} className="w-full rounded-lg border border-alert/30 bg-alert/5 p-2.5 text-left text-xs">
                      <span className="font-semibold">{CROP_BY_ID[x.cropId]?.name}</span>
                      <span className="text-muted-foreground"> — {x.hardFails[0]}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </SectionCard>

        {horizon > 1 && result && result.sequences.length > 0 ? (
          <SectionCard title="Top multi-season strategies" subtitle={`Combined score = mean of the season scores; the rotation score is recomputed for each season of the sequence.`}>
            <div className="grid gap-3 md:grid-cols-3">
              {result.sequences.map((seq, i) => (
                <div key={seq.cropIds.join("-")} className={cn("card p-3", i === 0 && "border-lime/50")}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">#{i + 1}</span>
                    <span className="num text-xl font-semibold">{seq.combined.toFixed(0)}</span>
                  </div>
                  <p className="mt-1 font-serif text-sm font-semibold">
                    {seq.cropIds.map((id) => CROP_BY_ID[id]?.name).join(" → ")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {seq.seasons.map((s) => (
                      <span key={s.seasonLabel} className="rounded bg-raised px-1.5 py-0.5 text-[10px]">
                        {s.seasonLabel}: <span className="num font-semibold">{s.overall.toFixed(0)}</span>
                      </span>
                    ))}
                  </div>
                  {seq.rotationNotes.length ? (
                    <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                      {seq.rotationNotes.map((n, j) => <li key={j}>• {n}</li>)}
                    </ul>
                  ) : null}
                  <p className="num mt-2 text-[11px] text-muted-foreground">Total water demand ≈ {seq.totalWaterM3PerAcre.toLocaleString()} m³/acre</p>
                </div>
              ))}
            </div>
          </SectionCard>
        ) : null}
      </div>

      {/* ---------- Explanation drawer ---------- */}
      <AnimatePresence>
        {detail ? <ExplanationDrawer crop={detail} runInput={runInput} onClose={() => setDetail(null)} /> : null}
      </AnimatePresence>
    </div>
  );
}

function RankedRow({ row, rank, baseRank, baseOverall }: { row: CropScore; rank: number; baseRank?: number; baseOverall?: number }) {
  const crop = CROP_BY_ID[row.cropId];
  const delta = baseRank != null ? baseRank - rank : null;
  const scoreDelta = baseOverall != null ? row.overall - baseOverall : null;
  return (
    <div className="flex items-center gap-3">
      <span className="num w-7 text-center text-lg font-semibold text-muted-foreground">{rank}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-serif text-sm font-semibold">{crop?.name}</span>
          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize", STATUS_STYLE[row.status])}>{row.status}</span>
          {delta != null && delta !== 0 ? (
            <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-semibold", delta > 0 ? "text-ok" : "text-alert")}>
              {delta > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {Math.abs(delta)} {delta > 0 ? "up" : "down"} vs baseline
            </span>
          ) : null}
          {scoreDelta != null && Math.abs(scoreDelta) >= 0.5 ? (
            <span className="num text-[10px] text-muted-foreground">
              ({scoreDelta > 0 ? "+" : ""}{scoreDelta.toFixed(1)} pts)
            </span>
          ) : null}
        </div>
        <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-background/60" aria-label="component scores">
          {(["water", "salinity", "heat", "rotation"] as const).map((k) => (
            <div key={k} style={{ width: `${row.components[k] * 25}%`, background: COMPONENT_COLORS[k], opacity: 0.85 }} title={`${k}: ${(row.components[k] * 100).toFixed(0)}%`} />
          ))}
        </div>
        <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{row.status === "excluded" ? row.hardFails[0] : row.summaryLine}</p>
      </div>
      <div className="text-right">
        <span className="num text-2xl font-semibold">{row.overall.toFixed(0)}</span>
        <span className="text-xs text-muted-foreground">/100</span>
      </div>
    </div>
  );
}

function WeightSliders({ weights, onChange }: { weights: Weights; onChange: (patch: Partial<Weights>) => void }) {
  const set = (key: keyof Weights, raw: number) => {
    // raise/lower this weight, take/give proportionally from the others (sum stays 1)
    const max = 0.7;
    const v = Math.min(max, Math.max(0, raw));
    const others = (Object.keys(weights) as (keyof Weights)[]).filter((k) => k !== key);
    const otherSum = others.reduce((acc, k) => acc + weights[k], 0);
    const next: Weights = { ...weights, [key]: v };
    if (otherSum > 0) {
      for (const k of others) next[k] = (weights[k] / otherSum) * (1 - v);
    } else {
      for (const k of others) next[k] = (1 - v) / others.length;
    }
    onChange(next);
  };
  const labels: Record<keyof Weights, string> = { water: "Save water", salinity: "Protect soil (salinity)", heat: "Avoid heat risk", rotation: "Rotation benefit" };
  return (
    <div className="space-y-2.5">
      {(Object.keys(weights) as (keyof Weights)[]).map((k) => (
        <div key={k}>
          <div className="flex justify-between text-[11px]">
            <span>{labels[k]}</span>
            <span className="num font-semibold">{weights[k].toFixed(2)}</span>
          </div>
          <input
            type="range" min={0} max={0.7} step={0.01} value={weights[k]}
            onChange={(e) => set(k, +e.target.value)}
            className="w-full accent-[#E9FDBD]"
            aria-label={labels[k]}
          />
        </div>
      ))}
    </div>
  );
}

function Slider({ label, min, max, step, value, onChange, tip }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; tip: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium">{label}</p>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="w-full accent-[#E9FDBD]" aria-label={label} />
      <p className="text-[10px] leading-snug text-muted-foreground">{tip}</p>
    </div>
  );
}

function ExplanationDrawer({ crop, runInput, onClose }: { crop: CropScore; runInput: RunEngineInput | null; onClose: () => void }) {
  return (
    <motion.aside
      initial={{ x: 420, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 420, opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      className="fixed right-0 top-0 z-40 h-full w-full max-w-md overflow-y-auto border-l border-border bg-panel p-5 shadow-2xl"
      aria-label="Explanation drawer"
    >
      <ExplanationInner crop={crop} runInput={runInput} onClose={onClose} />
    </motion.aside>
  );
}

function ExplanationInner({ crop, runInput, onClose }: { crop: CropScore; runInput: RunEngineInput | null; onClose: () => void }) {
  const cropDef = CROP_BY_ID[crop.cropId];
  const [printable, setPrintable] = useState(false);
  const sensitivity = useMemo(() => {
    if (!runInput || crop.status === "excluded") return [];
    const windows = seasonWindows(runInput.params);
    return overallAcrossTemps(crop.cropId, runInput, windows[0], [-2, -1, 0, 1, 2, 3, 4]);
  }, [runInput, crop]);

  const contributions = (["water", "salinity", "heat", "rotation"] as const).map((k) => ({
    key: k,
    points: crop.components[k] * runWeight(k) * 100,
  }));
  function runWeight(k: "water" | "salinity" | "heat" | "rotation"): number {
    const store = useCropStore.getState();
    return store.weights[k];
  }
  const sumContrib = contributions.reduce((a, b) => a + b.points, 0);

  return (
    <div className={cn(printable && "print-area")}>
      <div className="no-print mb-4 flex items-start justify-between">
        <h3 className="font-serif text-lg font-semibold">Why {cropDef?.name}</h3>
        <div className="flex gap-1.5">
          <button onClick={() => window.print()} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-raised" title="Download season plan (PDF) via the print dialog">
            <Download className="h-3.5 w-3.5" /> PDF
          </button>
          <button onClick={onClose} className="rounded-lg border border-border p-1.5 hover:bg-raised" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <p className="text-sm leading-relaxed">{crop.summaryLine}</p>

      {crop.status === "excluded" ? (
        <div className="mt-3 rounded-lg border border-alert/40 bg-alert/10 p-3">
          <p className="text-xs font-semibold text-alert">Excluded by hard rules</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">
            {crop.hardFails.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </div>
      ) : (
        <>
          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contribution to the overall score</h4>
          <div className="mt-2 space-y-1.5">
            {contributions.map((c) => (
              <div key={c.key} className="flex items-center gap-2">
                <span className="w-16 text-[11px] capitalize text-muted-foreground">{c.key}</span>
                <div className="h-3.5 flex-1 overflow-hidden rounded bg-background/60">
                  <div style={{ width: `${(c.points / Math.max(sumContrib, 1)) * 100}%`, background: COMPONENT_COLORS[c.key] }} className="h-full" />
                </div>
                <span className="num w-10 text-right text-[11px]">+{c.points.toFixed(1)}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 border-t border-border pt-1.5">
              <span className="w-16 text-[11px] font-semibold">Overall</span>
              <span className="num text-sm font-semibold">{crop.overall.toFixed(1)} / 100</span>
            </div>
          </div>

          {sensitivity.length ? (
            <>
              <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sensitivity to the temperature slider</h4>
              <div className="mt-1 h-36">
                <ResponsiveContainer>
                  <LineChart data={sensitivity} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
                    <XAxis dataKey="temp" tick={{ fontSize: 10, fill: "#a8b8a0" }} unit="°C" />
                    <YAxis tick={{ fontSize: 10, fill: "#a8b8a0" }} domain={[0, 100]} />
                    <Tooltip contentStyle={{ background: "#3E5648", border: "1px solid rgba(188,204,152,0.2)", borderRadius: 8, fontSize: 11 }} />
                    <ReferenceLine y={50} stroke="#E3B341" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="overall" stroke="#E9FDBD" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : null}
        </>
      )}

      <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inputs and provenance</h4>
      <table className="mt-2 w-full text-[11px]">
        <tbody>
          {[
            ["ECe used", `${crop.salinity.eceUsed.toFixed(1)} dS/m`, crop.salinity.source],
            ["FAO-29 a / b", `${crop.salinity.a} / ${crop.salinity.b}`, cropDef?.eceThreshold.status === "confirmed" ? "estimated" : "estimated"],
            ["Season window", crop.seasonLabel, "estimated"],
            ["Allowance", `${crop.water.availableM3PerAcre.toLocaleString()} m³/acre`, "measured"],
            ["Irrigation efficiency", `${(crop.water.efficiency * 100).toFixed(0)}% (${crop.water.efficiency === 0.9 ? "drip" : crop.water.efficiency === 0.75 ? "sprinkler" : "flood"})`, "estimated"],
            ["Net water demand", crop.water.netMm != null ? `${Math.round(crop.water.netMm)} mm` : "insufficient data", "estimated"],
            ["Gross requirement", crop.water.grossM3PerAcre != null ? `${Math.round(crop.water.grossM3PerAcre).toLocaleString()} m³/acre` : "—", "estimated"],
            ["Heat-limit Tmax", `${crop.heat.limitC} °C`, "simulated"],
            ["Heat-stress days", `${crop.heat.stressDays} / ${crop.heat.windowDays}`, "estimated"],
          ].map(([k, v, p]) => (
            <tr key={k} className="border-b border-border/60">
              <td className="py-1 pr-2 text-muted-foreground">{k}</td>
              <td className="num py-1 pr-2">{v}</td>
              <td className="py-1 text-right"><ProvenanceBadge kind={p} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Formulas with the actual numbers</h4>
      <div className="mt-2 space-y-1.5 rounded-lg bg-background/50 p-3 text-[11px] leading-relaxed">
        <p>Yr = 100 − b × (ECe − a) = 100 − {crop.salinity.b} × ({crop.salinity.eceUsed.toFixed(1)} − {crop.salinity.a}) = <b>{crop.salinity.relativeYieldPct.toFixed(0)}%</b></p>
        <p>s_water = min(1, {crop.water.availableM3PerAcre.toLocaleString()} / {crop.water.grossM3PerAcre != null ? Math.round(crop.water.grossM3PerAcre).toLocaleString() : "—"}) = <b>{fmt(crop.components.water, 2)}</b></p>
        <p>s_heat = clamp(1 − {crop.heat.stressDays}/{crop.heat.windowDays} / 0.4) = <b>{fmt(crop.components.heat, 2)}</b></p>
        <p>s_rotation = <b>{fmt(crop.components.rotation, 2)}</b> {crop.rotation.appliedRules.length > 1 ? `(${crop.rotation.appliedRules.filter((r) => r.rule !== "Start").map((r) => r.rule).join("; ")})` : "(no rotation rules applied)"}</p>
        <p>Overall = 100 × Σ(w·s) = <b>{crop.overall.toFixed(1)}</b></p>
      </div>

      <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Uncertainty note</h4>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        Climatology is a {useCropStore.getState().climateRows.length ? "12-year" : "0-year"} historical average from a ≈0.5° NASA POWER grid cell — not a forecast and not a field measurement.
        Heat limits and sowing windows are assumptions (VERIFY in Methodology). Where salinity is the regional estimate, ECe = 1.5 × irrigation-water EC and carries ESTIMATED provenance.
        This comparison is illustrative and must not be treated as an agronomically validated recommendation.
      </p>
    </div>
  );
}
