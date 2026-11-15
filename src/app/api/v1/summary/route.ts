import { db } from "@/lib/db";
import { getClimateCache, getFarm, getMeasuredEceDsm, getSettings, json } from "@/lib/crop/server";
import { moistureStressRule, salinityRiskRule, sensorReliabilityRule, combineHealth, type MoistureSeries, type EcSeries } from "@/lib/crop/field-health";
import { CROP_BY_ID } from "@/lib/crop/data/crops";
import { ec15ToEce } from "@/lib/crop/salinity";

export const dynamic = "force-dynamic";

// GET /api/v1/summary — one call powering the Overview KPIs, health badge and
// freshness strip. Every value carries provenance; nothing is invented.
export async function GET() {
  const farm = await getFarm();
  if (!farm) return json({ ok: false, error: "No farm profile" }, 404);
  const settings = await getSettings();
  const now = new Date();

  const nodes = await db.node.findMany({ orderBy: { name: "asc" } });
  const soilNodes = nodes.filter((n) => n.type === "soil_node");
  const moistureNodeIds = soilNodes.map((n) => n.id);

  const latest = async (sensor: string, nodeIds: string[]) => {
    const rows = await db.reading.findMany({
      where: { sensor, nodeId: { in: nodeIds }, qualityFlag: "ok" },
      orderBy: { ts: "desc" },
      take: 1,
    });
    return rows[0] ?? null;
  };
  const m1 = await latest("moisture", moistureNodeIds);
  const st = await latest("soil_temp", moistureNodeIds);
  const ecLatest = await latest("ec", moistureNodeIds);
  const nameOf = async (id: string) => (await db.node.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;

  // 7-day Tmax + most recent ET0 from the real NASA cache
  const { rows } = await getClimateCache();
  const todayKey = now.toISOString().slice(0, 10).replace(/-/g, "");
  const last7 = rows.filter((r) => r.date >= shiftKey(todayKey, -7) && r.tmax != null);
  const tmax7d = last7.length ? Math.max(...last7.map((r) => r.tmax as number)) : null;
  const todayRow = rows.find((r) => r.date === todayKey) ?? rows[rows.length - 1] ?? null;
  // most recent day with a computable ET0 (today's grid cell often lacks solar/RH)
  const lastEt0 = [...rows].reverse().find((r) => r.et0Mm != null) ?? null;
  const et0Date = lastEt0 ? `${lastEt0.date.slice(6, 8)}/${lastEt0.date.slice(4, 6)}` : null;

  const measured = await getMeasuredEceDsm();

  // ---- field health rules ----
  const since48h = new Date(now.getTime() - 48 * 3600000);
  const moistRows = await db.reading.findMany({
    where: { sensor: "moisture", nodeId: { in: moistureNodeIds }, ts: { gte: since48h } },
    orderBy: { ts: "asc" },
  });
  const moistureSeries: MoistureSeries[] = moistRows.map((r) => ({ ts: r.ts, value: r.value, flag: r.qualityFlag }));
  const ecRows = await db.reading.findMany({
    where: { sensor: "ec", nodeId: { in: moistureNodeIds }, ts: { gte: new Date(now.getTime() - 14 * 86400000) } },
    orderBy: { ts: "asc" },
  });
  const ecSeries: EcSeries[] = ecRows.map((r) => ({ ts: r.ts, value: r.value, flag: r.qualityFlag }));

  const selectedCrop = CROP_BY_ID[settings.selectedCropId] ?? CROP_BY_ID["tomato"];
  const stressPct = settings.moistureStressThresholdPct;

  const stuckCounts = await Promise.all(
    nodes.map(async (n) => {
      const c = await db.reading.count({ where: { nodeId: n.id, ts: { gte: since48h }, qualityFlag: "stuck" } });
      const o = await db.reading.count({ where: { nodeId: n.id, ts: { gte: since48h }, qualityFlag: "out_of_range" } });
      const lastSeen = n.lastSeen ? n.lastSeen.getTime() : 0;
      const offline = lastSeen && now.getTime() - lastSeen > 60 * 60000 ? Math.round((now.getTime() - lastSeen) / 600000) : 0;
      return { node: n.name, stuck: c, outOfRange: o, offlineIntervals: offline };
    }),
  );

  const mRule = moistureStressRule(moistureSeries, selectedCrop, stressPct, now);
  const sRule = salinityRiskRule(ecSeries, selectedCrop, settings.ec15ToEceFactor, now);
  const rRule = sensorReliabilityRule(stuckCounts);
  const health = combineHealth([mRule, sRule, rRule.evidence]);

  const metaRow = await db.setting.findUnique({ where: { key: "nasa_power_meta" } });
  const nasa = metaRow ? JSON.parse(metaRow.valueJson) : null;
  const demoRow = await db.setting.findUnique({ where: { key: "demoSeededAt" } });
  const ecEce = ecLatest ? ec15ToEce(ecLatest.value, farm.farm.soilTexture) : null;

  return json({
    ok: true,
    kpis: {
      moistureNow: m1 ? { value: m1.value, node: await nameOf(m1.nodeId), ts: m1.ts.toISOString() } : { value: null, node: null, ts: null },
      soilTempNow: st ? { value: st.value, node: await nameOf(st.nodeId), ts: st.ts.toISOString() } : { value: null, node: null, ts: null },
      ecEceNow: { value: ecEce, provenance: ecEce != null ? "measured" : null, ts: ecLatest?.ts.toISOString() ?? null },
      tmax7d,
      et0Today: lastEt0?.et0Mm ?? null,
      et0Date,
    },
    measuredEce: measured,
    health,
    freshness: [
      { source: "NASA POWER", lastUpdate: nasa?.fetchedAt ?? null, status: nasa ? "cached" : "unavailable", detail: `${rows.length} daily rows, ${nasa?.start ?? "?"}–${nasa?.end ?? "?"}` },
      { source: "Field sensors (simulated demo)", lastUpdate: m1?.ts.toISOString() ?? null, status: "demo", detail: `${soilNodes.length} nodes + station, 10-min cadence` },
      { source: "Landsat field NDVI", lastUpdate: null, status: "unavailable", detail: "Requires Earthdata credentials — regional GIBS NDVI layer on the map" },
      { source: "UAE FGIC soil maps", lastUpdate: null, status: "unavailable", detail: "No public programmatic access — salinity layer is a labelled SIMULATED placeholder" },
    ],
    nodes: nodes.map((n) => ({ id: n.id, name: n.name, type: n.type, lat: n.lat, lon: n.lon, batteryV: n.batteryV, rssi: n.rssi, lastSeen: n.lastSeen?.toISOString() ?? null })),
    demoSeededAt: demoRow?.valueJson ?? null,
  });

  function shiftKey(key: string, days: number): string {
    const d = new Date(Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8)));
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10).replace(/-/g, "");
  }
}
