"use client";

// Plant Signals (spec 4.8) — experimental module, clearly separated, never used
// in recommendations. Waveform viewer, stimulus markers, features, CSV export.

import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { AlertTriangle, Download, Radio } from "lucide-react";
import { useApi, fetchJson } from "./api";
import type { BioResponse } from "./api";
import { SectionCard, ProvenanceBadge, Skeleton, fmt } from "./ui-bits";
import { cn } from "@/lib/utils";

export default function SignalsView() {
  const { data, refetch, loading } = useApi<BioResponse>("/api/v1/bio");
  const [selected, setSelected] = useState(0);
  const [recording, setRecording] = useState(false);

  const session = data?.sessions?.[selected];

  const waveData = useMemo(() => {
    if (!session?.wave) return [];
    const step = Math.max(1, Math.ceil(session.wave.length / 600));
    return session.wave.filter((_, i) => i % step === 0).map((v, i) => ({ i: i * step, v }));
  }, [session]);

  const recordDemo = async () => {
    setRecording(true);
    // simulate a 10 s, 250 Hz burst with a stimulus at 4 s (SIMULATED)
    const samples: number[] = [];
    for (let i = 0; i < 2500; i++) {
      const t = i / 250;
      samples.push(12 + Math.sin(t * 0.7) * 1.4 + (Math.random() - 0.5) * 2 + (t > 4 && t < 4.25 ? 14 : 0));
    }
    await fetchJson("/api/v1/bio", {
      method: "POST",
      body: JSON.stringify({
        nodeId: null,
        sampleRateHz: 250,
        samples,
        markers: [{ ts: 4, label: "stimulus (water)" }],
        notes: "Demo session recorded in-app (SIMULATED).",
      }),
    }).catch(() => null);
    refetch();
    setSelected(0);
    setRecording(false);
  };

  const exportCsv = () => {
    if (!session?.wave) return;
    const rows = ["index,value", ...session.wave.map((v, i) => `${i},${v}`)].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows], { type: "text/csv" }));
    a.download = `bio-session-${session.id.slice(0, 8)}.csv`;
    a.click();
  };

  if (loading) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-xl border border-watch/50 bg-watch/10 p-3 text-xs">
        <AlertTriangle className="h-4 w-4 shrink-0 text-watch" />
        <p>
          <b>Experimental.</b> The plant bioelectric module is a research demo and is <b>never used in recommendations</b>. All displayed sessions are SIMULATED.
        </p>
      </div>

      <SectionCard
        title="Bioelectric sessions"
        subtitle="Baseline level, peak amplitude, response latency after each stimulus, RMS noise and drift."
        right={
          <button onClick={recordDemo} disabled={recording} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-raised disabled:opacity-50">
            <Radio className={cn("h-3.5 w-3.5", recording && "animate-pulse text-alert")} /> {recording ? "Recording…" : "Record demo session"}
          </button>
        }
      >
        <div className="mb-3 flex flex-wrap gap-1.5">
          {data?.sessions.map((s, i) => (
            <button key={s.id} onClick={() => setSelected(i)} className={cn("rounded-full border px-3 py-1 text-xs", i === selected ? "border-lime bg-lime/15 text-lime" : "border-border text-muted-foreground hover:bg-raised")}>
              {new Date(s.startedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {s.sampleRateHz} Hz
            </button>
          ))}
        </div>

        {session ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="h-56">
                <ResponsiveContainer>
                  <LineChart data={waveData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid stroke="rgba(188,204,152,0.12)" />
                    <XAxis dataKey="i" tick={{ fontSize: 9, fill: "#a8b8a0" }} label={{ value: "sample", fontSize: 9, fill: "#a8b8a0", position: "insideBottomRight" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#a8b8a0" }} />
                    <Tooltip contentStyle={{ background: "#3E5648", border: "1px solid rgba(188,204,152,0.2)", borderRadius: 8, fontSize: 11 }} />
                    {session.markers.map((m, i) => (
                      <ReferenceLine key={i} x={m.ts * session.sampleRateHz} stroke="#E3B341" strokeDasharray="3 3" label={{ value: m.label, fontSize: 9, fill: "#E3B341", position: "top" }} />
                    ))}
                    <Line type="monotone" dataKey="v" stroke="#8EC9E8" strokeWidth={1.2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <button onClick={exportCsv} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-raised">
                <Download className="h-3 w-3" /> Export CSV
              </button>
            </div>
            <div className="space-y-2 text-xs">
              <div className="rounded-lg border border-border p-3">
                <p className="mb-1 font-semibold">Features</p>
                {Object.entries(session.features).map(([k, v]) => (
                  <p key={k} className="flex justify-between py-0.5 text-[11px]">
                    <span className="text-muted-foreground">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
                    <span className="num font-semibold">{v != null ? fmt(v as number, 2) : "—"}</span>
                  </p>
                ))}
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="mb-1 font-semibold">Markers</p>
                {session.markers.length ? (
                  session.markers.map((m, i) => (
                    <p key={i} className="text-[11px] text-muted-foreground">
                      {m.label} @ sample {Math.round(m.ts * session.sampleRateHz).toLocaleString()}
                    </p>
                  ))
                ) : (
                  <p className="text-[11px] text-muted-foreground">None.</p>
                )}
              </div>
              <div className="rounded-lg border border-border p-3 text-[11px] leading-relaxed text-muted-foreground">
                <p className="font-semibold text-foreground">Setup notes</p>
                {session.notes}
                <p className="mt-1">Electrodes on the leaf petiole → INA128 instrumentation amplifier → ADS1115 (I²C) at {session.sampleRateHz} Hz in short bursts.</p>
                <p className="mt-1 flex items-center gap-1.5">Signal quality (noise floor RMS): <b className="num text-foreground">{fmt(session.features.rmsNoise as number, 2)}</b> <ProvenanceBadge kind="simulated" /></p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No sessions recorded yet — record the demo session to see the viewer.</p>
        )}
      </SectionCard>
    </div>
  );
}
