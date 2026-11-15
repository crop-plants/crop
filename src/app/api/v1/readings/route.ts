import { db } from "@/lib/db";
import { json } from "@/lib/crop/server";

export const dynamic = "force-dynamic";

// GET /api/v1/readings?node=<id|name>&sensor=<kind>&from=<ISO>&to=<ISO>&max=<n>
export async function GET(req: Request) {
  const url = new URL(req.url);
  const nodeParam = url.searchParams.get("node");
  const sensor = url.searchParams.get("sensor");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const max = Math.min(parseInt(url.searchParams.get("max") ?? "4000", 10) || 4000, 20000);

  const nodes = await db.node.findMany({ where: nodeParam ? { OR: [{ id: nodeParam }, { name: nodeParam }] } : undefined });
  if (nodeParam && nodes.length === 0) return json({ ok: false, error: "Unknown node" }, 404);

  const readings = await db.reading.findMany({
    where: {
      ...(nodes.length ? { nodeId: { in: nodes.map((n) => n.id) } } : {}),
      ...(sensor ? { sensor } : {}),
      ...(from || to ? { ts: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    },
    orderBy: { ts: "desc" },
    take: max,
    include: { node: { select: { name: true, type: true } } },
  });

  return json({
    ok: true,
    count: readings.length,
    provenance: readings.length ? readings[0].provenance : null,
    readings: readings.reverse().map((r) => ({
      id: r.id,
      node: r.node.name,
      nodeId: r.nodeId,
      sensor: r.sensor,
      ts: r.ts.toISOString(),
      raw: r.rawValue,
      value: r.value,
      unit: r.unit,
      flag: r.qualityFlag,
      provenance: r.provenance,
    })),
  });
}
