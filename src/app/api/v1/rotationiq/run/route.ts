import { getClimateCache, getFarm, getMeasuredEceDsm, getScenario, getWeights, json } from "@/lib/crop/server";
import { runRotationEngine } from "@/lib/crop/engine";
import { buildClimatology } from "@/lib/crop/climatology";
import { db } from "@/lib/db";
import { CROPS } from "@/lib/crop/data/crops";
import type { DailyClimate, RotationRunParams } from "@/lib/crop/types";

export const dynamic = "force-dynamic";

// POST /api/v1/rotationiq/run — same engine the UI runs client-side.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<RotationRunParams>;
  const f = await getFarm();
  if (!f) return json({ ok: false, error: "No farm profile" }, 404);

  const { rows } = await getClimateCache();
  const clim = buildClimatology(rows as DailyClimate[]);
  const measured = await getMeasuredEceDsm();
  const weights = body.weights ?? (await getWeights());
  const scenario = body.scenario ?? (await getScenario());

  const params: RotationRunParams = {
    farm: f.farm,
    scenario,
    weights,
    cropPool: body.cropPool ?? CROPS.map((c) => c.id),
    horizon: body.horizon ?? 1,
    seasonKind: body.seasonKind ?? "cool",
    customStartMonth: body.customStartMonth,
    startYear: body.startYear ?? new Date().getUTCFullYear(),
  };

  const result = runRotationEngine({
    farm: f.farm,
    daily: rows as DailyClimate[],
    params,
    measuredEceDsm: measured.ece,
    clim,
    cropPool: params.cropPool,
    weights,
  });

  await db.scenarioRun.create({
    data: {
      paramsJson: JSON.stringify({ ...params, measuredEce: measured.ece }),
      resultsJson: JSON.stringify({ ranked: result.ranked.slice(0, 8), excluded: result.excluded, sequences: result.sequences }),
    },
  });

  return json({ ok: true, params: { ...params, measuredEce: measured.ece }, result });
}
