import { db } from "@/lib/db";
import { json } from "@/lib/crop/server";
import { median } from "@/lib/crop/quality";

export const dynamic = "force-dynamic";

// GET /api/v1/reference — reference samples + validation metrics (MAE, bias, R2).
export async function GET() {
  const refs = await db.referenceSample.findMany({ orderBy: { ts: "desc" } });
  // pair each reference with the nearest-in-time usable reading of the same sensor (any node)
  const pairs: { sensor: string; ref: number; measured: number; ts: string; note: string | null }[] = [];
  for (const ref of refs) {
    const candidates = await db.reading.findMany({
      where: { sensor: ref.sensor, qualityFlag: "ok" },
      orderBy: { ts: "asc" },
      take: 4000,
    });
    if (!candidates.length) continue;
    // nearest by |ts - ref.ts|
    let best = candidates[0];
    let bestDt = Infinity;
    for (const c of candidates) {
      const dt = Math.abs(c.ts.getTime() - ref.ts.getTime());
      if (dt < bestDt) { bestDt = dt; best = c; }
    }
    if (bestDt <= 48 * 3600000) {
      pairs.push({ sensor: ref.sensor, ref: ref.value, measured: best.value, ts: ref.ts.toISOString(), note: ref.note });
    }
  }
  const bySensor: Record<string, { pairs: { ref: number; measured: number }[]; mae: number | null; bias: number | null; r2: number | null }> = {};
  const sensors = [...new Set(pairs.map((p) => p.sensor))];
  for (const s of sensors) {
    const ps = pairs.filter((p) => p.sensor === s);
    const refsA = ps.map((p) => p.ref);
    const meas = ps.map((p) => p.measured);
    const n = ps.length;
    const mae = n ? ps.reduce((acc, p) => acc + Math.abs(p.measured - p.ref), 0) / n : null;
    const bias = n ? ps.reduce((acc, p) => acc + (p.measured - p.ref), 0) / n : null;
    let r2: number | null = null;
    if (n >= 2) {
      const mr = median(refsA);
      const mm = median(meas);
      let sst = 0; let sse = 0;
      for (let i = 0; i < n; i++) { sst += (refsA[i] - mr) ** 2; sse += (meas[i] - refsA[i]) ** 2; }
      r2 = sst > 0 ? Math.max(0, 1 - sse / sst) : null;
    }
    bySensor[s] = { pairs: ps.map((p) => ({ ref: p.ref, measured: p.measured })), mae, bias, r2 };
  }
  return json({
    ok: true,
    samples: refs.map((r) => ({ id: r.id, sensor: r.sensor, ts: r.ts.toISOString(), value: r.value, note: r.note })),
    validation: bySensor,
  });
}

// POST { sensor, value, note } — log a lab/handheld reference value.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { sensor?: string; value?: number; note?: string } | null;
  if (!body?.sensor || typeof body.value !== "number") return json({ ok: false, error: "sensor and numeric value required" }, 400);
  const r = await db.referenceSample.create({ data: { sensor: body.sensor, ts: new Date(), value: body.value, note: body.note ?? null } });
  return json({ ok: true, sample: { id: r.id, ts: r.ts.toISOString() } }, 201);
}
