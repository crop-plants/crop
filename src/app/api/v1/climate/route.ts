import { db } from "@/lib/db";
import { getClimateCache, json } from "@/lib/crop/server";

export const dynamic = "force-dynamic";

// GET /api/v1/climate?from=YYYYMMDD&to=YYYYMMDD
export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const { rows, meta } = await getClimateCache();
  const filtered = rows.filter((r) => (!from || r.date >= from) && (!to || r.date <= to));
  const dbCount = await db.climateDaily.count();
  return json({
    ok: true,
    status: dbCount > 0 ? "cached" : "unavailable",
    count: filtered.length,
    meta: {
      dataset: "NASA POWER Daily, community AG",
      url: "https://power.larc.nasa.gov/api/temporal/daily/point",
      parameters: ["T2M", "T2M_MAX", "T2M_MIN", "RH2M", "WS2M", "ALLSKY_SFC_SW_DWN", "PRECTOTCORR"],
      resolution: "≈0.5° × 0.625° regional gridded estimates (not field measurements)",
      ...meta,
    },
    rows: filtered,
  });
}
