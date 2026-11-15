"use client";

// Economics (spec 4.7) — editable AED defaults, break-even card, cost charts,
// scalability table. Preliminary estimates only; savings are never invented.

import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line } from "recharts";
import { SectionCard, ProvenanceBadge, fmt } from "./ui-bits";
import { cn } from "@/lib/utils";

const DEFAULT_COMPONENTS: { name: string; price: number }[] = [
  { name: "ESP32 node ×3 (moisture + soil temp)", price: 165 },
  { name: "Air sensor (station)", price: 15 },
  { name: "EC sensor", price: 499 },
  { name: "pH kit (manual)", price: 165 },
  { name: "Bioelectric module + conditioning", price: 210 },
  { name: "Enclosures, wiring, power, install", price: 505 },
  { name: "Calibration + reference testing", price: 120 },
];

export default function EconomicsView() {
  const [components, setComponents] = useState(DEFAULT_COMPONENTS);
  const [nodes, setNodes] = useState(3);
  const [solar, setSolar] = useState(true);
  const [contingencyPct, setContingencyPct] = useState(15);
  const [amortYears, setAmortYears] = useState(3);
  const [annualRunning, setAnnualRunning] = useState({ hosting: 360, calibration: 180, replacements: 235 });
  const [waterPrice, setWaterPrice] = useState<number | "">("");
  const [annualVolume, setAnnualVolume] = useState<number | "">("");

  const subtotal = useMemo(() => components.reduce((a, c) => a + c.price, 0), [components]);
  const contingency = useMemo(() => Math.round(subtotal * (contingencyPct / 100)), [subtotal, contingencyPct]);
  const total = subtotal + contingency + (solar ? 540 : 0);
  const running = annualRunning.hosting + annualRunning.calibration + annualRunning.replacements;
  const annualised = Math.round(total / amortYears + running);

  const costData = components.map((c) => ({ name: c.name.split("(")[0].trim(), price: c.price }));
  const cumulative = useMemo(
    () => Array.from({ length: 3 }, (_, i) => ({ year: `Year ${i + 1}`, cost: Math.round(total + running * (i + 1)) })),
    [total, running],
  );

  const breakEvenPct = waterPrice !== "" && annualVolume !== "" && +waterPrice > 0 && +annualVolume > 0
    ? (annualised / (+waterPrice * +annualVolume)) * 100
    : null;

  const scale = [1, 5, 20].map((acres) => ({
    acres,
    oneOff: Math.round(total + (acres - 1) * (components[0].price / 3 + components[4].price + 120)),
    annual: Math.round(running + (acres - 1) * 60),
  }));

  return (
    <div className="space-y-4">
      <SectionCard
        title="System economics — one acre (AED)"
        subtitle="Preliminary estimates, subject to supplier quotes and field testing. The app computes costs and a break-even threshold only — it never claims savings."
        right={<ProvenanceBadge kind="estimated" />}
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-2 text-xs">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Components (editable)</p>
            {components.map((c, i) => (
              <div key={c.name} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2">
                <span className="flex-1">{c.name}</span>
                <input
                  type="number"
                  value={c.price}
                  onChange={(e) => setComponents((cs) => cs.map((x, j) => (j === i ? { ...x, price: +e.target.value } : x)))}
                  className="num w-20 rounded-md border border-border bg-raised px-1.5 py-1 text-right text-xs"
                  aria-label={`${c.name} price`}
                />
              </div>
            ))}
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-xs">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={solar} onChange={(e) => setSolar(e.target.checked)} className="accent-[#E9FDBD]" /> Off-grid solar
              </label>
              <span className="num">{solar ? "+AED 540" : "—"}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-muted-foreground">
                Contingency %
                <input type="number" value={contingencyPct} onChange={(e) => setContingencyPct(+e.target.value)} className="num mt-1 w-full rounded-md border border-border bg-raised px-2 py-1.5 text-xs" />
              </label>
              <label className="text-[11px] text-muted-foreground">
                Amortisation years
                <input type="number" value={amortYears} onChange={(e) => setAmortYears(+e.target.value)} className="num mt-1 w-full rounded-md border border-border bg-raised px-2 py-1.5 text-xs" />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-[11px] text-muted-foreground">
                Hosting/yr
                <input type="number" value={annualRunning.hosting} onChange={(e) => setAnnualRunning((r) => ({ ...r, hosting: +e.target.value }))} className="num mt-1 w-full rounded-md border border-border bg-raised px-2 py-1.5 text-xs" />
              </label>
              <label className="text-[11px] text-muted-foreground">
                Calibration/yr
                <input type="number" value={annualRunning.calibration} onChange={(e) => setAnnualRunning((r) => ({ ...r, calibration: +e.target.value }))} className="num mt-1 w-full rounded-md border border-border bg-raised px-2 py-1.5 text-xs" />
              </label>
              <label className="text-[11px] text-muted-foreground">
                Replacements/yr
                <input type="number" value={annualRunning.replacements} onChange={(e) => setAnnualRunning((r) => ({ ...r, replacements: +e.target.value }))} className="num mt-1 w-full rounded-md border border-border bg-raised px-2 py-1.5 text-xs" />
              </label>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-lime/50 bg-lime/10 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-lime">Break-even card</p>
              <p className="num mt-1 text-2xl font-semibold">AED {annualised.toLocaleString()}</p>
              <p className="mt-1 text-[11px] leading-relaxed">
                annualised cost per acre (one-off AED {total.toLocaleString()} ÷ {amortYears} + AED {running.toLocaleString()} running). The system pays back if it avoids about
                <b> AED {annualised.toLocaleString()}</b> of water and input waste per acre per year.
              </p>
            </div>
            <div className="rounded-xl border border-border p-4 text-xs">
              <p className="font-semibold">Water-price helper (user-entered only)</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-[11px] text-muted-foreground">
                  Water price (AED/m³)
                  <input type="number" step={0.01} value={waterPrice} onChange={(e) => setWaterPrice(e.target.value === "" ? "" : +e.target.value)} placeholder="—" className="num mt-1 w-full rounded-md border border-border bg-raised px-2 py-1.5 text-xs" />
                </label>
                <label className="text-[11px] text-muted-foreground">
                  Annual irrigation (m³)
                  <input type="number" value={annualVolume} onChange={(e) => setAnnualVolume(e.target.value === "" ? "" : +e.target.value)} placeholder="—" className="num mt-1 w-full rounded-md border border-border bg-raised px-2 py-1.5 text-xs" />
                </label>
              </div>
              {breakEvenPct != null ? (
                <p className="mt-2 text-[11px] leading-relaxed">
                  To break even, water and input waste must fall by about <b className="num">{breakEvenPct.toFixed(1)}%</b> of your current annual water spend
                  (AED {(+waterPrice * +annualVolume).toLocaleString()}). No savings are claimed or pre-filled.
                </p>
              ) : (
                <p className="mt-2 text-[11px] text-muted-foreground">Enter your water price and annual irrigation volume to see the required reduction.</p>
              )}
            </div>
            <div className="rounded-xl border border-border p-4 text-xs">
              <p className="font-semibold">Scalability (shared components)</p>
              <table className="mt-2 w-full text-[11px]">
                <thead><tr className="text-muted-foreground"><th className="text-left font-medium">Acres</th><th className="text-right font-medium">One-off (AED)</th><th className="text-right font-medium">Annual (AED)</th></tr></thead>
                <tbody>
                  {scale.map((s) => (
                    <tr key={s.acres} className="border-t border-border/60">
                      <td className="num py-1">{s.acres}</td>
                      <td className="num py-1 text-right">{s.oneOff.toLocaleString()}</td>
                      <td className="num py-1 text-right">{s.annual.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <div className="h-56">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cost breakdown</p>
              <ResponsiveContainer>
                <BarChart data={costData} layout="vertical" margin={{ left: 8, right: 12 }}>
                  <CartesianGrid stroke="rgba(188,204,152,0.12)" />
                  <XAxis type="number" tick={{ fontSize: 9, fill: "#a8b8a0" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 8, fill: "#a8b8a0" }} width={104} />
                  <Tooltip contentStyle={{ background: "#3E5648", border: "1px solid rgba(188,204,152,0.2)", borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey="price" name="AED" fill="#6C9A52" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="h-44">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">3-year cumulative cost</p>
              <ResponsiveContainer>
                <LineChart data={cumulative} margin={{ left: -12, right: 12 }}>
                  <CartesianGrid stroke="rgba(188,204,152,0.12)" />
                  <XAxis dataKey="year" tick={{ fontSize: 9, fill: "#a8b8a0" }} />
                  <YAxis tick={{ fontSize: 9, fill: "#a8b8a0" }} />
                  <Tooltip contentStyle={{ background: "#3E5648", border: "1px solid rgba(188,204,152,0.2)", borderRadius: 8, fontSize: 11 }} />
                  <Line type="monotone" dataKey="cost" name="AED" stroke="#E9FDBD" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-lg border border-border p-3 text-[11px] text-muted-foreground">
              Subtotal <span className="num float-right">{subtotal.toLocaleString()}</span><br />
              Contingency ({contingencyPct}%) <span className="num float-right">{contingency.toLocaleString()}</span><br />
              {solar ? <>Solar <span className="num float-right">540</span><br /></> : null}
              <b className="text-foreground">One-off total <span className="num float-right">{total.toLocaleString()}</span></b>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
