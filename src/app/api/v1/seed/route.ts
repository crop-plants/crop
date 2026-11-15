import { json } from "@/lib/crop/server";
import { seedDemoData } from "@/lib/crop/seed";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/v1/seed — regenerate the demo dataset (Settings > Reset demo data).
export async function POST() {
  try {
    const r = await seedDemoData();
    return json({ ok: true, ...r, note: "All sensor rows are provenance=simulated; NASA POWER cache untouched" });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
}
