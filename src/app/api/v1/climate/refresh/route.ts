import { db } from "@/lib/db";
import { json } from "@/lib/crop/server";
import { syncPowerToDb } from "@/lib/crop/power-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/v1/climate/refresh — live refresh from NASA POWER (real API, no key).
export async function POST() {
  const farm = await db.farm.findFirst();
  const lat = farm?.lat ?? 24.21;
  const lon = farm?.lon ?? 55.76;
  const end = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const r = await syncPowerToDb(lat, lon, "20150101", end);
  if (!r.ok) {
    return json({ ok: false, status: "unavailable", message: r.message, note: "Cached data remains in use — nothing was fabricated" }, 502);
  }
  return json({ ok: true, status: "live", rowsUpserted: r.rows, start: r.start, end: r.end, fetchedAt: r.fetchedAt });
}
