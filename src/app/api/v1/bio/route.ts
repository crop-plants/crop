import { db } from "@/lib/db";
import { json } from "@/lib/crop/server";

export const dynamic = "force-dynamic";

// GET /api/v1/bio — recorded experimental sessions (with downsampled waveform).
export async function GET() {
  const sessions = await db.bioSession.findMany({ orderBy: { startedAt: "desc" }, take: 10 });
  return json({
    ok: true,
    experimental: true,
    notice: "Plant Signals is experimental and never influences recommendations.",
    sessions: sessions.map((s) => ({
      id: s.id,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      sampleRateHz: s.sampleRateHz,
      notes: s.notes,
      markers: JSON.parse(s.markersJson || "[]"),
      features: JSON.parse(s.featuresJson || "{}"),
      wave: s.waveJson ? JSON.parse(s.waveJson) : null,
    })),
  });
}

// POST { nodeId?, sampleRateHz, samples: number[], markers? } — batched ingest.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { nodeId?: string; sampleRateHz?: number; samples?: number[]; markers?: { ts: number; label: string }[]; notes?: string } | null;
  if (!body?.samples || !Array.isArray(body.samples) || body.samples.length === 0) {
    return json({ ok: false, error: "samples array required" }, 400);
  }
  // downsample to <= 2400 points for storage
  const samples = body.samples;
  const step = Math.max(1, Math.ceil(samples.length / 2400));
  const wave = samples.filter((_, i) => i % step === 0);
  const s = await db.bioSession.create({
    data: {
      nodeId: body.nodeId ?? null,
      startedAt: new Date(),
      sampleRateHz: body.sampleRateHz ?? 250,
      notes: body.notes ?? "Ingested batch",
      markersJson: JSON.stringify(body.markers ?? []),
      featuresJson: JSON.stringify({ baseline: null, peakAmplitude: null }),
      waveJson: JSON.stringify(wave),
    },
  });
  return json({ ok: true, id: s.id, stored: wave.length }, 201);
}
