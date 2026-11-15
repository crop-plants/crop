import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/v1/export?node=&sensor=&from=&to= — CSV download of readings.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const nodeParam = url.searchParams.get("node");
  const sensor = url.searchParams.get("sensor");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const nodes = await db.node.findMany({ where: nodeParam ? { OR: [{ id: nodeParam }, { name: nodeParam }] } : undefined });
  const readings = await db.reading.findMany({
    where: {
      ...(nodes.length ? { nodeId: { in: nodes.map((n) => n.id) } } : {}),
      ...(sensor ? { sensor } : {}),
      ...(from || to ? { ts: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    },
    orderBy: { ts: "asc" },
    take: 50000,
    include: { node: { select: { name: true } } },
  });

  const header = "node,ts,sensor,raw_value,value,unit,quality_flag,provenance";
  const lines = readings.map((r) =>
    [r.node.name, r.ts.toISOString(), r.sensor, r.rawValue, r.value, r.unit, r.qualityFlag, r.provenance].join(","),
  );
  const csv = [header, ...lines].join("\n");
  const fname = `crop-readings-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="${fname}"` },
  });
}
