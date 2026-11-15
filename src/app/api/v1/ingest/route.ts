import { db } from "@/lib/db";
import { json } from "@/lib/crop/server";
import { flagSeries } from "@/lib/crop/quality";
import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";

const SENSOR_UNITS: Record<string, string> = {
  moisture: "%", soil_temp: "°C", ec: "dS/m", ph: "pH", air_temp: "°C", air_rh: "%",
};
const SENSOR_CAL: Record<string, { raw: number; value: number }> = {
  moisture: { raw: 750, value: 52 }, // two-point handled generically below
};

// POST /api/v1/ingest  (header X-API-Key)
// { node_id, ts?, battery_v?, rssi?, readings: { moisture_raw, soil_temp_c, ec_raw, air_temp_c, air_rh, ph_raw } }
export async function POST(req: Request) {
  const key = req.headers.get("x-api-key");
  if (!key) return json({ ok: false, error: "Missing X-API-Key header" }, 401);
  const hash = createHash("sha256").update(key).digest("hex");
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ ok: false, error: "Invalid JSON body" }, 400);
  const b = body as {
    node_id?: string; ts?: string; battery_v?: number; rssi?: number;
    readings?: Record<string, number>;
  };
  if (!b.node_id || !b.readings || typeof b.readings !== "object") {
    return json({ ok: false, error: "node_id and readings required" }, 400);
  }
  const node = await db.node.findFirst({ where: { name: b.node_id } });
  if (!node) return json({ ok: false, error: `Unknown node ${b.node_id}` }, 404);
  if (node.apiKeyHash && node.apiKeyHash !== hash) return json({ ok: false, error: "Invalid API key" }, 401);

  const ts = b.ts ? new Date(b.ts) : new Date();
  if (isNaN(ts.getTime())) return json({ ok: false, error: "Invalid ts" }, 400);

  const mapping: [string, string, string, (raw: number) => number][] = [
    ["moisture_raw", "moisture", "%", (raw) => Math.max(0, Math.min(100, ((2950 - raw) / (2950 - 750)) * 52))],
    ["soil_temp_c", "soil_temp", "°C", (raw) => raw],
    ["ec_raw", "ec", "dS/m", (raw) => Math.max(0, (raw / 912) * 1.413)],
    ["air_temp_c", "air_temp", "°C", (raw) => raw],
    ["air_rh", "air_rh", "%", (raw) => Math.max(0, Math.min(100, raw))],
    ["ph_raw", "ph", "pH", (raw) => Math.max(0, Math.min(14, raw))],
  ];

  const rows: { nodeId: string; ts: Date; sensor: string; rawValue: number; value: number; unit: string; qualityFlag: string; provenance: string }[] = [];
  for (const [bodyKey, sensor, unit, convert] of mapping) {
    const raw = b.readings[bodyKey];
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    const value = convert(raw);
    const flags = flagSeries({ sensor: sensor as never, values: [value] });
    rows.push({ nodeId: node.id, ts, sensor, rawValue: raw, value, unit, qualityFlag: flags[0] ?? "ok", provenance: "measured" });
  }
  if (rows.length === 0) return json({ ok: false, error: "No recognised readings in payload" }, 422);
  await db.reading.createMany({ data: rows });
  await db.node.update({
    where: { id: node.id },
    data: {
      lastSeen: ts,
      ...(typeof b.battery_v === "number" ? { batteryV: b.battery_v } : {}),
      ...(typeof b.rssi === "number" ? { rssi: Math.round(b.rssi) } : {}),
    },
  });
  return json({ ok: true, stored: rows.length, ts: ts.toISOString(), note: "Raw and calibrated values stored; quality flags applied" }, 202);
}
