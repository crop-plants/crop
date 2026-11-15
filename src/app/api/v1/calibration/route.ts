import { db } from "@/lib/db";
import { json } from "@/lib/crop/server";

export const dynamic = "force-dynamic";

// GET /api/v1/calibration?node=<name> — calibration history.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const nodeName = url.searchParams.get("node");
  const nodes = await db.node.findMany({ where: nodeName ? { name: nodeName } : undefined, include: { calibrations: { orderBy: { createdAt: "desc" } } } });
  return json({
    ok: true,
    nodes: nodes.map((n) => ({
      id: n.id,
      name: n.name,
      calibrations: n.calibrations.map((c) => ({ id: c.id, sensor: c.sensor, method: c.method, coefficients: JSON.parse(c.coefficientsJson), createdAt: c.createdAt.toISOString() })),
    })),
  });
}

// POST { nodeName, sensor, method, coefficients } — store new calibration.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { nodeName?: string; sensor?: string; method?: string; coefficients?: Record<string, unknown> } | null;
  if (!body?.nodeName || !body.sensor || !body.method || !body.coefficients) {
    return json({ ok: false, error: "nodeName, sensor, method, coefficients required" }, 400);
  }
  const node = await db.node.findFirst({ where: { name: body.nodeName } });
  if (!node) return json({ ok: false, error: "Unknown node" }, 404);
  const cal = await db.calibration.create({
    data: { nodeId: node.id, sensor: body.sensor, method: body.method, coefficientsJson: JSON.stringify(body.coefficients) },
  });
  return json({ ok: true, calibration: { id: cal.id, createdAt: cal.createdAt.toISOString() }, note: "Coefficients apply to subsequent ingest conversions" }, 201);
}
