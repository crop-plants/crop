import { db } from "@/lib/db";
import { json } from "@/lib/crop/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 100);
  const alerts = await db.alert.findMany({ orderBy: { ts: "desc" }, take: limit });
  return json({ ok: true, alerts: alerts.map((a) => ({ ...a, ts: a.ts.toISOString() })) });
}

// POST { id, acknowledged } to acknowledge; or POST { acknowledgedAll: true }
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const b = body as { id?: string; acknowledgedAll?: boolean };
  if (b.acknowledgedAll) {
    await db.alert.updateMany({ data: { acknowledged: true } });
    return json({ ok: true, acknowledgedAll: true });
  }
  if (!b.id) return json({ ok: false, error: "id or acknowledgedAll required" }, 400);
  await db.alert.update({ where: { id: b.id }, data: { acknowledged: true } });
  return json({ ok: true });
}
