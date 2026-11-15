"use client";

// Climate (spec 4.4) — NASA POWER cached series, FAO-56 PM ET0, heat calendar,
// scenario shifts (SIMULATED), NDVI honesty panel, CSV downloads.

import { useMemo, useState } from "react";
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar, Legend } from "recharts";
import { Download, RefreshCw, Info } from "lucide-react";
import { useCropStore } from "./store";
import { SectionCard, ProvenanceBadge, Skeleton, EmptyState, fmt, TooltipMetric as Tip } from "./ui-bits";
import { fao56Et0, dayOfYear } from "@/lib/crop/et0";
import { cn } from "@/lib/utils";

const RANGES = [
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "365d", label: "Last 365 days", days: 365 },
  { key: "all", label: "2015–present", days: 100000 },
];

export default function ClimateView() {
  const { climateRows, nasaMeta, climateStatus, refreshClimate, farm } = useCropStore();
  const [range, setRange] = useState("365d");
  const [heatThreshold, setHeatThreshold] = useState(35);
  const [tempScenario, setTempScenario] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!climateRows?.length) return [];
    const days = RANGES.find((r) => r.key === range)?.days ?? 365;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
    return climateRows.filter((r) => r.date >= cutoff);
  }, [climateRows, range]);

  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        date: `${r.date.slice(4, 6)}/${r.date.slice(6, 8)}`,
        tmax: r.tmax,
        tmin: r.tmin,
        et0: r.et0Mm,
        rh: r.rh,
        wind: r.wind2m,
        solar: r.solarMj,
        rain: r.rainMm,
      })),
    [rows],
  );

  const scenarioData = useMemo(() => {
    // recompute ET0 from the raw daily series with the temperature shift applied
    if (!farm) return [];
    return rows.map((r) => {
      if (r.tmax == null || r.tmin == null) return { date: r.date.slice(4, 6) + "/" + r.date.slice(6, 8), base: r.et0Mm, scenario: null as number | null };
      const dt = new Date(Date.UTC(+r.date.slice(0, 4), +r.date.slice(4, 6) - 1, +r.date.slice(6, 8)));
      const br = fao56Et0({
        tmax: r.tmax + tempScenario,
        tmin: r.tmin + tempScenario,
        rhMean: r.rh,
        u2: r.wind2m,
        rs: r.solarMj,
        latDeg: farm.lat,
        elevM: farm.elevationM,
        doy: dayOfYear(dt),
      });
      return { date: r.date.slice(4, 6) + "/" + r.date.slice(6, 8), base: r.et0Mm, scenario: br.et0 };
    });
  }, [rows, tempScenario, farm]);

  const heatDays = useMemo(() => rows.filter((r) => (r.tmax ?? -99) > heatThreshold).length, [rows, heatThreshold]);

  // year heat calendar: last 365 days coloured by Tmax
  const calendar = useMemo(() => rows.slice(-365).map((r) => ({ date: r.date, tmax: r.tmax ?? 0 })), [rows]);

  const downloadCsv = () => {
    const header = "date,tmax_c,tmin_c,tmean_c,rh_pct,wind2m_ms,solar_mj_m2_day,rain_mm,et0_mm";
    const lines = rows.map((r) => [r.date, r.tmax, r.tmin, r.tmean, r.rh, r.wind2m, r.solarMj, r.rainMm, r.et0Mm].join(","));
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nasa-power-${range}.csv`;
    a.click();
  };

  if (!climateRows?.length) {
    return (
      <EmptyState
        title="No NASA POWER data cached"
        body="Use the refresh button to retrieve real daily observations from the NASA POWER API. Until a retrieval succeeds, this screen shows no invented values."
      />
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="Regional climate intelligence — NASA POWER"
        subtitle={`${nasaMeta ? `${nasaMeta.start.slice(0, 4)}–${nasaMeta.end.slice(0, 4)} · ${nasaMeta.rowsTotal} daily rows · grid cell ≈ 0.5° × 0.625° (regional gridded estimates, not field measurements)` : ""}`}
        right={
          <div className="flex items-center gap-2">
            <ProvenanceBadge kind={climateStatus === "live" ? "measured" : "estimated"} />
            <span className="rounded-full bg-watch/15 px-2 py-0.5 text-[9px] font-bold uppercase text-watch">{climateStatus}</span>
            <button
              onClick={async () => {
                setBusy(true);
                const r = await refreshClimate();
                setMsg(r.message ?? null);
                setBusy(false);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-raised"
              disabled={busy}
            >
              <RefreshCw className={cn("h-3 w-3", busy && "animate-spin")} /> Refresh from NASA
            </button>
          </div>
        }
      >
        {msg ? <p className="mb-2 text-xs text-muted-foreground">{msg}</p> : null}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)} className={cn("rounded-full border px-3 py-1 text-xs", range === r.key ? "border-lime bg-lime/15 text-lime" : "border-border text-muted-foreground hover:bg-raised")}>
              {r.label}
            </button>
          ))}
          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            Heat threshold
            <input type="number" value={heatThreshold} min={20} max={50} onChange={(e) => setHeatThreshold(+e.target.value)} className="w-16 rounded-md border border-border bg-raised px-1.5 py-1 text-xs" aria-label="Heat threshold °C" /> °C
            <span className="num">· {heatDays} days above in range</span>
          </span>
          <button onClick={downloadCsv} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-raised">
            <Download className="h-3 w-3" /> CSV
          </button>
        </div>
        <div className="h-64">
          <ResponsiveContainer>
            <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="rgba(188,204,152,0.12)" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#a8b8a0" }} interval="preserveStartEnd" minTickGap={48} />
              <YAxis tick={{ fontSize: 10, fill: "#a8b8a0" }} unit="°C" />
              <Tooltip contentStyle={{ background: "#3E5648", border: "1px solid rgba(188,204,152,0.2)", borderRadius: 8, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Area type="monotone" dataKey="tmax" name="Tmax" stroke="#E5604D" fill="#E5604D" fillOpacity={0.14} strokeWidth={1.6} />
              <Area type="monotone" dataKey="tmin" name="Tmin" stroke="#8EC9E8" fill="#8EC9E8" fillOpacity={0.1} strokeWidth={1.6} />
              <ReferenceLine y={heatThreshold} stroke="#E3B341" strokeDasharray="4 4" label={{ value: "heat threshold", fontSize: 9, fill: "#E3B341", position: "insideTopRight" }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          <Info className="mr-1 inline h-3 w-3" />
          These are historical observations from the NASA POWER Daily API (fill value −999 removed — gaps are gaps, never interpolated).
        </p>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Reference evapotranspiration (FAO-56 Penman-Monteith)" subtitle="Daily ET0 from the cached series. Unit test validated against FAO-56 Example 18 (Uccle): 3.9 mm/day.">
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
                <CartesianGrid stroke="rgba(188,204,152,0.12)" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#a8b8a0" }} interval="preserveStartEnd" minTickGap={48} />
                <YAxis tick={{ fontSize: 10, fill: "#a8b8a0" }} unit=" mm" />
                <Tooltip contentStyle={{ background: "#3E5648", border: "1px solid rgba(188,204,152,0.2)", borderRadius: 8, fontSize: 11 }} />
                <Line type="monotone" dataKey="et0" name="ET0" stroke="#E9FDBD" strokeWidth={1.8} dot={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Tip tip="ET0 = [0.408·Δ·Rn + γ·(900/(Tmean+273))·u2·(es−ea)] / [Δ + γ·(1+0.34·u2)] — FAO-56 Eq. 6, daily (G=0), albedo 0.23.">
            <p className="mt-1 cursor-help text-[10px] text-muted-foreground">Formula details <Info className="inline h-3 w-3" /></p>
          </Tip>
        </SectionCard>

        <SectionCard
          title="Climate scenarios"
          subtitle="Temperature shift applied to Tmax/Tmean before recomputing ET0 from the raw daily series — labelled SIMULATED, never a NASA projection."
          right={<ProvenanceBadge kind="simulated" />}
        >
          <div className="mb-2 flex gap-1.5">
            {[0, 1, 2, 3].map((t) => (
              <button key={t} onClick={() => setTempScenario(t)} className={cn("rounded-full border px-3 py-1 text-xs", tempScenario === t ? "border-lime bg-lime/15 text-lime" : "border-border text-muted-foreground hover:bg-raised")}>
                {t === 0 ? "Baseline" : `+${t} °C`}
              </button>
            ))}
          </div>
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={scenarioData} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
                <CartesianGrid stroke="rgba(188,204,152,0.12)" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#a8b8a0" }} interval="preserveStartEnd" minTickGap={48} />
                <YAxis tick={{ fontSize: 10, fill: "#a8b8a0" }} unit=" mm" />
                <Tooltip contentStyle={{ background: "#3E5648", border: "1px solid rgba(188,204,152,0.2)", borderRadius: 8, fontSize: 11 }} />
                <Line type="monotone" dataKey="base" name="baseline ET0" stroke="#BCCC98" strokeWidth={1.4} dot={false} connectNulls={false} />
                <Line type="monotone" dataKey="scenario" name={`ET0 ${tempScenario > 0 ? `+${tempScenario}°C` : "baseline"}`} stroke="#E9FDBD" strokeWidth={1.8} dot={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Heat-stress calendar" subtitle="Each day of the last 365 coloured by Tmax (NASA POWER).">
          <div className="grid grid-flow-col grid-rows-7 gap-[2px]" style={{ gridAutoColumns: "4px" }}>
            {calendar.map((d) => {
              const t = d.tmax;
              const color = t > 45 ? "#E5604D" : t > heatThreshold ? "#E3B341" : t > 30 ? "#6C9A52" : "#8EC9E8";
              return <div key={d.date} title={`${d.date}: ${t.toFixed(1)}°C`} style={{ background: color, width: 4, height: 4, borderRadius: 1 }} />;
            })}
          </div>
          <div className="mt-2 flex gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-info" />&lt;30°</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-ok" />30–{heatThreshold}°</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-watch" />{heatThreshold}–45°</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-alert" />&gt;45°</span>
          </div>
        </SectionCard>

        <SectionCard title="Vegetation index (NDVI)" subtitle="Field-level Landsat NDVI series — connection status shown honestly." right={<ProvenanceBadge kind="unavailable" />}>
          <EmptyState
            title="Landsat field NDVI: not connected"
            body="Deriving a field-mean NDVI time series requires Landsat Collection-2 surface-reflectance access (Earthdata credentials + offline processing). No values are fabricated here. Regional NDVI context is available as a live NASA GIBS layer on the Field Map."
          />
        </SectionCard>
      </div>

      <SectionCard title="Rainfall and humidity" subtitle="PRECTOTCORR rainfall (small in Al Ain) and RH2M — real observations only.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-48">
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
                <CartesianGrid stroke="rgba(188,204,152,0.12)" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#a8b8a0" }} interval="preserveStartEnd" minTickGap={48} />
                <YAxis tick={{ fontSize: 10, fill: "#a8b8a0" }} unit=" mm" />
                <Tooltip contentStyle={{ background: "#3E5648", border: "1px solid rgba(188,204,152,0.2)", borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="rain" name="Rain (PRECTOTCORR)" fill="#8EC9E8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="h-48">
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
                <CartesianGrid stroke="rgba(188,204,152,0.12)" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#a8b8a0" }} interval="preserveStartEnd" minTickGap={48} />
                <YAxis tick={{ fontSize: 10, fill: "#a8b8a0" }} unit=" %" />
                <Tooltip contentStyle={{ background: "#3E5648", border: "1px solid rgba(188,204,152,0.2)", borderRadius: 8, fontSize: 11 }} />
                <Line type="monotone" dataKey="rh" name="RH2M" stroke="#E3B341" strokeWidth={1.4} dot={false} connectNulls={false} />
                <Line type="monotone" dataKey="wind" name="WS2M" stroke="#6C9A52" strokeWidth={1.4} dot={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
