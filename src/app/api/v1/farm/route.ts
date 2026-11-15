import { db } from "@/lib/db";
import { getFarm, json, putSetting } from "@/lib/crop/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const f = await getFarm();
  if (!f) return json({ ok: false, error: "No farm profile — run the setup wizard or seed demo data" }, 404);
  return json({ ok: true, ...f });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ ok: false, error: "Invalid body" }, 400);
  const f = await getFarm();
  if (!f) return json({ ok: false, error: "No farm profile" }, 404);
  const patch: Record<string, unknown> = {};
  const b = body as Record<string, unknown>;
  if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim().slice(0, 120);
  if (typeof b.lat === "number" && b.lat >= -90 && b.lat <= 90) patch.lat = b.lat;
  if (typeof b.lon === "number" && b.lon >= -180 && b.lon <= 180) patch.lon = b.lon;
  if (typeof b.elevationM === "number") patch.elevationM = b.elevationM;
  if (typeof b.soilTexture === "string") patch.soilTexture = b.soilTexture;
  if (typeof b.waterEcDsm === "number" && b.waterEcDsm >= 0 && b.waterEcDsm <= 30) patch.waterEcDsm = b.waterEcDsm;
  if (typeof b.irrigationAllowanceM3PerAcre === "number" && b.irrigationAllowanceM3PerAcre > 0) patch.irrigationAllowanceM3PerAcre = b.irrigationAllowanceM3PerAcre;
  if (typeof b.irrigationMethod === "string" && ["drip", "sprinkler", "flood"].includes(b.irrigationMethod)) patch.irrigationMethod = b.irrigationMethod;
  if (b.cropHistory && Array.isArray(b.cropHistory)) patch.cropHistory = JSON.stringify(b.cropHistory);
  if (b.polygonGeojson) patch.polygonGeojson = JSON.stringify(b.polygonGeojson);
  if (Object.keys(patch).length === 0) return json({ ok: false, error: "Nothing valid to update" }, 400);
  const updated = await db.farm.update({ where: { id: f.id }, data: patch });
  await putSetting("farmUpdatedAt", new Date().toISOString());
  return json({ ok: true, farm: updated });
}
