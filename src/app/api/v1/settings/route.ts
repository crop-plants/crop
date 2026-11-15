import { db } from "@/lib/db";
import { getMeasuredEceDsm, getScenario, getSettings, getWeights, json, putSetting } from "@/lib/crop/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const [settings, weights, scenario, keys, meta, measured] = await Promise.all([
    getSettings(),
    getWeights(),
    getScenario(),
    db.setting.findUnique({ where: { key: "deviceApiKeys" } }),
    db.setting.findUnique({ where: { key: "nasa_power_meta" } }),
    getMeasuredEceDsm(),
  ]);
  const farm = await db.farm.findFirst({ select: { dataMode: true } });
  return json({
    ok: true,
    settings,
    weights,
    scenario,
    dataMode: farm?.dataMode ?? "demo",
    deviceApiKeys: keys ? JSON.parse(keys.valueJson) : [],
    nasaPowerMeta: meta ? JSON.parse(meta.valueJson) : null,
    measuredEce: measured,
  });
}

// PUT { weights? , appSettings?, scenario?, dataMode? }
export async function PUT(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ ok: false, error: "Invalid body" }, 400);
  if (body.weights && typeof body.weights === "object") await putSetting("weights", body.weights);
  if (body.appSettings && typeof body.appSettings === "object") await putSetting("appSettings", body.appSettings);
  if (body.scenario && typeof body.scenario === "object") await putSetting("scenario", body.scenario);
  if (typeof body.dataMode === "string" && ["demo", "live"].includes(body.dataMode)) {
    await db.farm.updateMany({ data: { dataMode: body.dataMode } });
  }
  return json({ ok: true });
}
