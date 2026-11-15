import { db } from "@/lib/db";
import { getClimateCache, json } from "@/lib/crop/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [farm, climateCount, readingCount, alertCount] = await Promise.all([
      db.farm.findFirst({ select: { id: true, name: true, dataMode: true } }),
      db.climateDaily.count(),
      db.reading.count(),
      db.alert.count({ where: { acknowledged: false } }),
    ]);
    const { meta } = await getClimateCache();
    return json({
      ok: true,
      app: "C.R.O.P. — Climate and Resource Optimization for Plants",
      database: "available",
      farm: farm ? { name: farm.name, dataMode: farm.dataMode } : null,
      data: {
        climateRows: climateCount,
        sensorReadings: readingCount,
        unacknowledgedAlerts: alertCount,
        nasaPower: meta ?? null,
      },
      time: new Date().toISOString(),
    });
  } catch (e) {
    return json({ ok: false, database: "unavailable", error: (e as Error).message }, 503);
  }
}
