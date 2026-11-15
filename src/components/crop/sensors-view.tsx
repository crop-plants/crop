"use client";

// Sensors (spec 4.3) — node list, detail charts with threshold bands, raw vs
// calibrated toggle, calibration panel, reference check, manual log, CSV export.

import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea, Legend } from "recharts";
import { Download, FlaskConical, Wrench } from "lucide-react";
import { useApi, fetchJson } from "./api";
import type { ReadingsResponse } from "./api";
import { SectionCard, ProvenanceBadge, StatusDot, Skeleton, fmt, fmtTs, CopyButton, EmptyState } from "./ui-bits";
import { useCropStore } from "./store";
import { cn } from "@/lib/utils";

const SENSORS = [
  { key: "moisture", label: "Soil moisture", unit: "%", color: "#8EC9E8", band: [22, 100] },
  { key: "soil_temp", label: "Soil temperature", unit: "°C", color: "#E3B341", band: null },
  { key: "ec", label: "Soil EC", unit: "dS/m", color: "#E5604D", band: null },
  { key: "air_temp", label: "Air temperature", unit: "°C", color: "#E3B341", band: null },
  { key: "air_rh", label: "Air humidity", unit: "%", color: "#8EC9E8", band: null },
];

const RANGES = [
  { key: "6h", label: "6 h", hours: 6 },
  { key: "24h", label: "24 h", hours: 24 },
  { key: "7d", label: "7 d", hours: 168 },
  { key: "30d", label: "30 d", hours: 720 },
];

export default function SensorsView() {
  const { data: nodes, loading, refetch } = useApi<{ nodes: { id: string; name: string; type: string; batteryV: number | null; rssi: number | null; lastSeen: string | null }[] }>("/api/v1/summary");
  const [selected, setSelected] = useState<string | null>(null);
  const [sensor, setSensor] = useState("moisture");
  const [rangeKey, setRangeKey] = useState("24h");
  const [raw, setRaw] = useState(false);

  const node = selected ?? nodes?.nodes?.find((n) => n.type === "soil_node")?.name ?? "Node 1";
  const hours = RANGES.find((r) => r.key === rangeKey)?.hours ?? 24;
  const from = useMemo(() => new Date(Date.now() - hours * 3600000).toISOString(), [hours]);
  const q = `/api/v1/readings?node=${encodeURIComponent(node)}&sensor=${sensor}&from=${encodeURIComponent(from)}&max=4000`;
  const { data, error, refetch: refetchReadings } = useApi<ReadingsResponse>(q);

  const chartData = useMemo(() => {
    if (!data?.readings) return [];
    return data.readings.map((r) => ({
      t: new Date(r.ts).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
      value: raw ? r.raw : r.value,
      flag: r.flag,
    }));
  }, [data, raw]);

  const flagged = data?.readings.filter((r) => r.flag !== "ok") ?? [];
  const unit = raw ? "raw counts" : SENSORS.find((s) => s.key === sensor)?.unit ?? "";

  if (loading) return <Skeleton className="h-96" />;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      {/* node list */}
      <div className="space-y-2 xl:col-span-3">
        {nodes?.nodes.map((n) => {
          const online = n.lastSeen && Date.now() - new Date(n.lastSeen).getTime() < 60 * 60000;
          return (
            <button
              key={n.id}
              onClick={() => setSelected(n.name)}
              className={cn("card-raised w-full p-3 text-left", node === n.name && "border-lime/60")}
            >
              <div className="flex items-center justify-between">
                <span className="font-serif text-sm font-semibold">{n.name}</span>
                <StatusDot level={online ? "ok" : "offline"} />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {n.type === "station" ? "Shared sensors (EC, air)" : "Soil node"} · battery {fmt(n.batteryV, 2)} V · {n.rssi ?? "?"} dBm
              </p>
              <p className="num text-[10px] text-muted-foreground">last seen {fmtTs(n.lastSeen)}</p>
            </button>
          );
        })}
        <ExportButton node={node} sensor={sensor} from={from} />
      </div>

      {/* detail */}
      <div className="space-y-4 xl:col-span-6">
        <SectionCard
          title={`${node} — ${SENSORS.find((s) => s.key === sensor)?.label}`}
          subtitle={`${data?.count ?? 0} readings in range · ${data?.provenance === "simulated" ? "SIMULATED demo data" : "measured"}`}
          right={<ProvenanceBadge kind={data?.provenance ?? "simulated"} />}
        >
          <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
            {SENSORS.filter((s) => s.key !== "air_temp" || node === "Station").map((s) => (
              <button key={s.key} onClick={() => setSensor(s.key)} className={cn("rounded-full border px-2.5 py-1", sensor === s.key ? "border-lime bg-lime/15 text-lime" : "border-border text-muted-foreground hover:bg-raised")}>
                {s.label}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-border" />
            {RANGES.map((r) => (
              <button key={r.key} onClick={() => setRangeKey(r.key)} className={cn("rounded-full border px-2.5 py-1", rangeKey === r.key ? "border-sage bg-sage/15" : "border-border text-muted-foreground hover:bg-raised")}>
                {r.label}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={raw} onChange={(e) => setRaw(e.target.checked)} className="accent-[#E9FDBD]" /> raw
            </label>
          </div>

          {error ? <EmptyState title="Readings unavailable" body={error} /> : null}
          {!error && chartData.length === 0 ? <Skeleton className="h-56" /> : null}
          {chartData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="rgba(188,204,152,0.12)" />
                  <XAxis dataKey="t" tick={{ fontSize: 9, fill: "#a8b8a0" }} interval="preserveStartEnd" minTickGap={60} />
                  <YAxis tick={{ fontSize: 10, fill: "#a8b8a0" }} label={{ value: unit, fontSize: 9, fill: "#a8b8a0", angle: -90, position: "insideLeft" }} domain={["auto", "auto"]} />
                  <Tooltip contentStyle={{ background: "#3E5648", border: "1px solid rgba(188,204,152,0.2)", borderRadius: 8, fontSize: 11 }} />
                  {sensor === "moisture" ? <ReferenceArea y1={22} y2={0} fill="#E5604D" fillOpacity={0.12} label={{ value: "stress band < 22%", fontSize: 9, fill: "#E5604D", position: "insideBottomRight" }} /> : null}
                  <Line type="monotone" dataKey="value" stroke={SENSORS.find((s) => s.key === sensor)?.color} strokeWidth={1.6} dot={false} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          {flagged.length > 0 ? (
            <div className="mt-3 rounded-lg border border-watch/40 bg-watch/10 p-2.5 text-xs">
              <p className="font-semibold text-watch">{flagged.length} readings flagged in range</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Stuck / out-of-range / suspect readings are shown in the raw series but excluded from KPIs, health rules and RotationIQ inputs. First flagged: {fmtTs(flagged[0]?.ts)} ({flagged[0].flag}).
              </p>
            </div>
          ) : null}
        </SectionCard>

        <ReferenceCheck />
      </div>

      {/* calibration + manual log */}
      <div className="space-y-4 xl:col-span-3">
        <CalibrationPanel nodeName={node} sensor={sensor} />
        <ManualLog />
      </div>
    </div>
  );
}

function ExportButton({ node, sensor, from }: { node: string; sensor: string; from: string }) {
  const url = `/api/v1/export?node=${encodeURIComponent(node)}&sensor=${encodeURIComponent(sensor)}&from=${encodeURIComponent(from)}`;
  return (
    <a href={url} className="card-raised flex items-center justify-center gap-2 p-3 text-xs font-semibold hover:border-sage/60" download>
      <Download className="h-3.5 w-3.5" /> Export CSV ({node} · {sensor})
    </a>
  );
}

function CalibrationPanel({ nodeName, sensor }: { nodeName: string; sensor: string }) {
  const { data, refetch } = useApi<{ nodes: { name: string; calibrations: { id: string; sensor: string; method: string; coefficients: Record<string, unknown>; createdAt: string }[] }[] }>(`/api/v1/calibration?node=${encodeURIComponent(nodeName)}`);
  const [busy, setBusy] = useState(false);
  const cals = data?.nodes?.[0]?.calibrations.filter((c) => c.sensor === sensor) ?? [];
  const latest = cals[0];

  const save = async (method: string, coefficients: Record<string, unknown>) => {
    setBusy(true);
    await fetchJson("/api/v1/calibration", { method: "POST", body: JSON.stringify({ nodeName, sensor, method, coefficients }) }).catch(() => null);
    setBusy(false);
    refetch();
  };

  return (
    <SectionCard title="Calibration" subtitle={`${nodeName} · ${sensor}`} right={<Wrench className="h-4 w-4 text-muted-foreground" />}>
      {latest ? (
        <div className="space-y-2 text-xs">
          <div className="rounded-lg border border-border p-2.5">
            <p className="font-semibold capitalize">{latest.method.replace("_", " ")} coefficients</p>
            <pre className="mt-1 overflow-x-auto text-[10px] leading-relaxed text-muted-foreground">{JSON.stringify(latest.coefficients, null, 1)}</pre>
            <p className="num mt-1 text-[10px] text-muted-foreground">
              calibrated {latest.coefficients.calibratedDaysAgo ? `${latest.coefficients.calibratedDaysAgo} days ago` : fmtTs(latest.createdAt)}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No calibration on record for this sensor — values are raw conversions. Calibrate before trusting thresholds.</p>
      )}
      <div className="mt-3 space-y-1.5">
        {sensor === "moisture" ? (
          <button onClick={() => save("two_point", { dryRaw: 2950, wetRaw: 750, dryValue: 0, wetValue: 52, calibratedDaysAgo: 0 })} disabled={busy} className="w-full rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-raised">
            Log 2-point moisture calibration (dry 2950 → 0%, wet 750 → 52%)
          </button>
        ) : null}
        {sensor === "ec" ? (
          <button onClick={() => save("one_point", { rawAtStandard: 912, standardValue: 1.413, calibratedDaysAgo: 0 })} disabled={busy} className="w-full rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-raised">
            Log 1-point EC calibration (912 → 1.413 mS/cm standard, 25 °C)
          </button>
        ) : null}
        {sensor === "ph" ? (
          <button onClick={() => save("three_point", { buffers: [4.01, 7.0, 10.01], calibratedDaysAgo: 0 })} disabled={busy} className="w-full rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-raised">
            Log 3-point pH calibration (4.01 / 7.00 / 10.01 buffers)
          </button>
        ) : null}
      </div>
      {sensor === "ec" ? (
        <div className="mt-3 rounded-lg border border-watch/40 bg-watch/10 p-2.5 text-[10px] leading-relaxed">
          EC → ECe conversion: readings are on a 1:5 extract basis; ECe = reading × 2.2 (sandy loam factor, editable in Settings).
          <b> Calibrate this factor against a lab ECe (saturated-paste) test.</b>
        </div>
      ) : null}
    </SectionCard>
  );
}

function ReferenceCheck() {
  const { data, refetch } = useApi<{
    samples: { id: string; sensor: string; ts: string; value: number; note: string | null }[];
    validation: Record<string, { pairs: { ref: number; measured: number }[]; mae: number | null; bias: number | null; r2: number | null }>;
  }>("/api/v1/reference");
  const [value, setValue] = useState("");
  const [sensor, setSensor] = useState("ec");
  const [note, setNote] = useState("");

  return (
    <SectionCard title="Reference check" subtitle="Lab or handheld reference values vs sensor readings — the validation evidence." right={<FlaskConical className="h-4 w-4 text-muted-foreground" />}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5 text-[11px]">
          {Object.entries(data?.validation ?? {}).map(([s, v]) => (
            <div key={s} className="rounded-lg border border-border p-2.5">
              <p className="font-semibold capitalize">{s}</p>
              <p className="num mt-1 text-muted-foreground">
                n = {v.pairs.length} · MAE {fmt(v.mae, 3)} · bias {fmt(v.bias, 3)} · R² {v.r2 != null ? v.r2.toFixed(2) : "—"}
              </p>
              <div className="mt-1 flex h-16 items-center gap-1">
                {v.pairs.map((p, i) => {
                  const min = Math.min(...v.pairs.map((x) => x.ref));
                  const max = Math.max(...v.pairs.map((x) => x.ref), ...v.pairs.map((x) => x.measured));
                  const span = max - min || 1;
                  return (
                    <span key={i} className="relative inline-block h-full w-4 rounded bg-background/50" title={`ref ${p.ref} vs measured ${p.measured}`}>
                      <i className="absolute h-1 w-1 rounded-full bg-watch" style={{ left: "30%", bottom: `${((p.ref - min) / span) * 90}%` }} />
                      <i className="absolute h-1 w-1 rounded-full bg-lime" style={{ left: "55%", bottom: `${((p.measured - min) / span) * 90}%` }} />
                    </span>
                  );
                })}
              </div>
              <p className="text-[9px] text-muted-foreground">amber = reference, green = sensor</p>
            </div>
          ))}
          {data && Object.keys(data.validation).length === 0 ? <p className="text-muted-foreground">No paired reference values yet.</p> : null}
        </div>
        <div className="space-y-2 text-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Log a reference value</p>
          <div className="flex gap-1.5">
            <select value={sensor} onChange={(e) => setSensor(e.target.value)} className="rounded-md border border-border bg-raised px-2 py-1.5 text-xs" aria-label="Reference sensor">
              <option value="ec">EC / ECe</option>
              <option value="ph">pH (manual kit)</option>
              <option value="moisture">Moisture (gravimetric)</option>
            </select>
            <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="value" className="num w-24 rounded-md border border-border bg-raised px-2 py-1.5 text-xs" aria-label="Reference value" />
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="note (lab name, method…)" className="w-full rounded-md border border-border bg-raised px-2 py-1.5 text-xs" aria-label="Note" />
          <button
            onClick={async () => {
              if (!value) return;
              await fetchJson("/api/v1/reference", { method: "POST", body: JSON.stringify({ sensor, value: +value, note }) }).catch(() => null);
              setValue("");
              setNote("");
              refetch();
            }}
            className="rounded-lg border border-lime/50 bg-lime/10 px-3 py-1.5 text-xs font-semibold text-lime hover:bg-lime/20"
          >
            Save reference sample
          </button>
          <p className="text-[10px] text-muted-foreground">pH is measured on a prepared soil–water sample with a manual kit — it is logged, not streamed.</p>
        </div>
      </div>
    </SectionCard>
  );
}

function ManualLog() {
  const [ph, setPh] = useState("");
  const [ec, setEc] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <SectionCard title="Log a manual sample" subtitle="Prepared soil–water sample readings (pH kit, handheld EC).">
      <div className="space-y-2 text-xs">
        <input value={ph} onChange={(e) => setPh(e.target.value)} placeholder="pH (e.g. 7.4)" className="num w-full rounded-md border border-border bg-raised px-2 py-1.5" aria-label="pH" />
        <input value={ec} onChange={(e) => setEc(e.target.value)} placeholder="EC 1:5 (e.g. 1.9 dS/m)" className="num w-full rounded-md border border-border bg-raised px-2 py-1.5" aria-label="EC" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="note" className="w-full rounded-md border border-border bg-raised px-2 py-1.5" aria-label="Note" />
        <button
          onClick={async () => {
            if (ph) await fetchJson("/api/v1/reference", { method: "POST", body: JSON.stringify({ sensor: "ph", value: +ph, note: `manual sample. ${note}` }) }).catch(() => null);
            if (ec) await fetchJson("/api/v1/reference", { method: "POST", body: JSON.stringify({ sensor: "ec", value: +ec, note: `manual 1:5 sample. ${note}` }) }).catch(() => null);
            setSaved("Sample logged — see the reference check panel.");
            setPh("");
            setEc("");
          }}
          className="w-full rounded-lg border border-border px-3 py-1.5 font-semibold hover:bg-raised"
        >
          Save sample
        </button>
        {saved ? <p className="text-[10px] text-ok">{saved}</p> : null}
      </div>
    </SectionCard>
  );
}
