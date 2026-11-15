"use client";

// Overview (spec 4.1) — single-screen summary with provenance on every number.

import { useApi } from "./api";
import type { AlertRow, SummaryResponse } from "./api";
import { useCropStore } from "./store";
import { KpiCard, SectionCard, ProvenanceBadge, StatusDot, Skeleton, ErrorState, fmt, fmtTs } from "./ui-bits";
import { CROP_BY_ID } from "@/lib/crop/data/crops";
import { ArrowRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { runRotationEngine } from "@/lib/crop/engine";
import { buildClimatology } from "@/lib/crop/climatology";

export default function OverviewView() {
  const { farm, farmName, dataMode, setView, nasaMeta } = useCropStore();
  const { data, error, loading, refetch } = useApi<SummaryResponse>("/api/v1/summary");
  const alerts = useApi<{ alerts: AlertRow[] }>("/api/v1/alerts?limit=5");

  if (error) return <ErrorState message={error} retry={refetch} />;
  if (loading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-40" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const healthLevel = (data.health.status as "ok" | "watch" | "alert") ?? "ok";
  const selectedCrop = CROP_BY_ID["tomato"];

  return (
    <div className="space-y-4">
      {/* header card */}
      <div className="card-raised flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h1 className="font-serif text-2xl font-semibold">{farmName}</h1>
          <p className="text-xs text-muted-foreground">
            {farm ? `${farm.lat.toFixed(3)}° N, ${farm.lon.toFixed(3)}° E · elevation ≈ ${Math.round(farm.elevationM)} m · sandy loam · drip irrigation` : "—"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("inline-block h-2 w-2 rounded-full", dataMode === "demo" ? "bg-info" : "bg-ok")} />
            {dataMode === "demo" ? "Demo data" : "Live data"}
          </span>
          <span>Last NASA sync: <span className="num">{fmtTs(nasaMeta?.fetchedAt ?? null)}</span></span>
          <ProvenanceBadge kind={dataMode === "demo" ? "simulated" : "measured"} />
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard
          label="Soil moisture now" value={data.kpis.moistureNow.value != null ? fmt(data.kpis.moistureNow.value, 1) : null} unit="%"
          provenance="simulated"
          tip={`Latest usable reading from ${data.kpis.moistureNow.node ?? "a soil node"} at ${fmtTs(data.kpis.moistureNow.ts)}. Demo generator output — SIMULATED.`}
        />
        <KpiCard
          label="Soil temperature" value={data.kpis.soilTempNow.value != null ? fmt(data.kpis.soilTempNow.value, 1) : null} unit="°C"
          provenance="simulated"
          tip={`Latest usable soil temperature at ${fmtTs(data.kpis.soilTempNow.ts)}. SIMULATED demo data.`}
        />
        <KpiCard
          label="Soil ECe now" value={data.kpis.ecEceNow.value != null ? fmt(data.kpis.ecEceNow.value, 1) : null} unit="dS/m"
          provenance={data.kpis.ecEceNow.provenance ?? "unavailable"}
          tip="Sensor EC (1:5 basis) converted to saturated-paste ECe with the texture factor (2.2, sandy loam). Calibrate this factor against a lab ECe test. Marker = tomato limit 2.5 dS/m."
          extra={
            <div className="relative mt-1 h-1.5 w-full rounded bg-background/60">
              <div className="absolute h-1.5 rounded bg-alert/70" style={{ width: `${Math.min(100, ((data.kpis.ecEceNow.value ?? 0) / 8) * 100)}%` }} />
              <div className="absolute -top-1 h-3.5 w-0.5 bg-foreground/70" style={{ left: `${(2.5 / 8) * 100}%` }} title="tomato limit 2.5 dS/m" />
            </div>
          }
        />
        <KpiCard
          label="7-day max air temp" value={data.kpis.tmax7d != null ? fmt(data.kpis.tmax7d, 1) : null} unit="°C"
          provenance="measured"
          tip="Highest daily T2M_MAX in the last 7 days from the cached NASA POWER series (regional gridded estimate)."
        />
        <KpiCard
          label={`ET0 ${((data.kpis as { et0Date?: string }).et0Date) ? `day ${(data.kpis as { et0Date?: string }).et0Date}` : "(latest day)"}`} value={data.kpis.et0Today != null ? fmt(data.kpis.et0Today, 2) : null} unit="mm/day"
          provenance="estimated"
          tip="FAO-56 Penman-Monteith reference ET0 computed from NASA POWER T2M/T2M_MAX/T2M_MIN/RH2M/WS2M/solar for the latest day with a full parameter set. Validated against FAO-56 Example 18."
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* field health badge */}
        <SectionCard title="Field Health" subtitle="Three transparent rules — see the Field Health screen for evidence." right={<button onClick={() => setView("health")} className="text-xs text-muted-foreground hover:text-lime">Open <ArrowRight className="inline h-3 w-3" /></button>}>
          <div className={cn("rounded-xl border p-4", healthLevel === "ok" ? "border-ok/40 bg-ok/10" : healthLevel === "watch" ? "border-watch/40 bg-watch/10" : "border-alert/40 bg-alert/10")}>
            <div className="flex items-center gap-3">
              <StatusDot level={healthLevel} />
              <span className="font-serif text-lg font-semibold capitalize">{healthLevel}</span>
            </div>
            <p className="mt-1.5 text-xs">{data.health.topReason ?? "All rules passing."}</p>
          </div>
        </SectionCard>

        {/* next-season recommendation */}
        <SectionCard title="Next-season recommendation" subtitle={`RotationIQ preview for the cool season starting October — deterministic scores from NASA climatology.`} right={<ProvenanceBadge kind="estimated" />}>
          <RotationPreview />
          <button onClick={() => setView("rotationiq")} className="mt-3 w-full rounded-lg border border-lime/50 bg-lime/10 px-3 py-2 text-xs font-semibold text-lime hover:bg-lime/20">
            Open RotationIQ <ArrowRight className="inline h-3 w-3" />
          </button>
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* alerts feed */}
        <SectionCard title="Alerts" subtitle="Latest 5 events generated by the quality and threshold rules." right={<button onClick={() => setView("health")} className="text-xs text-muted-foreground hover:text-lime">All</button>}>
          <div className="space-y-2">
            {alerts.data?.alerts.slice(0, 5).map((a) => (
              <div key={a.id} className={cn("rounded-lg border p-2.5 text-xs", a.severity === "alert" ? "border-alert/40 bg-alert/10" : a.severity === "watch" ? "border-watch/40 bg-watch/10" : "border-border")}>
                <div className="flex items-center justify-between gap-2">
                  <StatusDot level={a.severity as "watch" | "alert"} />
                  <span className="num text-[10px] text-muted-foreground">{fmtTs(a.ts)}</span>
                </div>
                <p className="mt-1 break-words">{a.message}</p>
              </div>
            ))}
            {alerts.data && alerts.data.alerts.length === 0 ? <p className="text-xs text-muted-foreground">No alerts — all sensors healthy.</p> : null}
          </div>
        </SectionCard>

        {/* freshness strip */}
        <SectionCard title="Data freshness" subtitle="Each source with its last update and connection status.">
          <div className="space-y-2 text-xs">
            {data.freshness.map((f) => (
              <div key={f.source} className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5">
                <div className="min-w-0">
                  <p className="font-semibold">{f.source}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{f.detail}</p>
                </div>
                <div className="text-right">
                  <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-bold uppercase", f.status === "cached" ? "bg-watch/15 text-watch" : f.status === "demo" ? "bg-info/15 text-info" : "bg-alert/15 text-alert")}>{f.status}</span>
                  <p className="num mt-0.5 text-[10px] text-muted-foreground">{fmtTs(f.lastUpdate)}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* mini map */}
      <SectionCard title="Field snapshot" subtitle="Mini map with sensor pins — full layers on the Field Map screen." right={<button onClick={() => setView("map")} className="text-xs text-muted-foreground hover:text-lime">Open map</button>}>
        <MiniMapPreview nodes={data.nodes} />
      </SectionCard>

      <div className="flex justify-end">
        <button onClick={refetch} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-raised">
          <RefreshCw className="h-3 w-3" /> Refresh summary
        </button>
      </div>
    </div>
  );
}

function RotationPreview() {
  const { climateRows, farm, measuredEce, weights, scenario } = useCropStore();
  const top = useMemo<[string, number][]>(() => {
    if (!farm || climateRows.length === 0) return [];
    const clim = buildClimatology(climateRows);
    const r = runRotationEngine({
      farm,
      daily: climateRows,
      params: { farm, scenario, weights, cropPool: CROPS_IDS, horizon: 1, seasonKind: "cool", startYear: new Date().getUTCFullYear() },
      measuredEceDsm: measuredEce?.ece ?? null,
      clim,
      cropPool: CROPS_IDS,
      weights,
    });
    return r.ranked.slice(0, 3).map((x) => [x.cropId, x.overall]);
  }, [farm, climateRows, measuredEce, weights, scenario]);
  if (top.length === 0) return <Skeleton className="h-24" />;
  return (
    <div className="space-y-2">
      {top.map(([id, score], i) => (
        <div key={id} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
          <span className="num w-5 text-sm font-semibold text-muted-foreground">{i + 1}</span>
          <div className="flex-1">
            <p className="text-sm font-semibold">{CROP_BY_ID[id]?.name}</p>
            <p className="text-[10px] text-muted-foreground">{CROP_BY_ID[id]?.family} · {topReason(id)}</p>
          </div>
          <span className="num text-lg font-semibold">{score.toFixed(0)}</span>
          <span className="text-[10px] text-muted-foreground">/100</span>
        </div>
      ))}
    </div>
  );
}

const CROPS_IDS = CROP_BY_ID ? Object.keys(CROP_BY_ID) : [];

function topReason(id: string): string {
  const c = CROP_BY_ID[id];
  if (!c) return "";
  if (c.nitrogenRole === "fixer") return "nitrogen fixer — good before heavy feeders";
  if (c.eceThreshold.value >= 2.5) return "salt-tolerant for this soil";
  return "moderate water demand in the cool window";
}

function MiniMapPreview({ nodes }: { nodes: SummaryResponse["nodes"] }) {
  const { farm } = useCropStore();
  if (!farm) return null;
  const W = 100;
  const H = 60;
  const span = 0.004;
  const cx = farm.lon;
  const cy = farm.lat;
  const toXY = (lon: number, lat: number): [number, number] => [((lon - cx) / span + 0.5) * W, (0.5 - (lat - cy) / span) * H];
  const poly = farm.polygonGeojson?.coordinates?.[0];
  const pts = poly ? poly.map(([lon, lat]) => toXY(lon, lat)) : null;
  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-border bg-[#233026]" style={{ height: 240 }}>
      {/* satellite tiles approximation: static satellite raster via img (Esri) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${cx - span / 2},${cy - span / 2},${cx + span / 2},${cy + span / 2}&bboxSR=4326&size=800,480&format=jpg&f=image`}
        alt="Satellite snapshot around the field"
        className="absolute inset-0 h-full w-full object-cover opacity-90"
        loading="lazy"
      />
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        {pts ? <polygon points={pts.map((p) => p.join(",")).join(" ")} fill="#E9FDBD" fillOpacity="0.18" stroke="#E9FDBD" strokeWidth="0.4" /> : null}
      </svg>
      {nodes.map((n) => {
        const [x, y] = toXY(n.lon, n.lat);
        return (
          <div key={n.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
            <span className={cn("inline-block h-3 w-3 rounded-full border-2 border-[#16221B]", n.type === "station" ? "bg-info" : "bg-ok")} title={n.name} />
          </div>
        );
      })}
      <span className="absolute bottom-2 right-2 rounded bg-black/40 px-1.5 py-0.5 text-[9px] text-white">Esri World Imagery</span>
    </div>
  );
}
