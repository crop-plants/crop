// Fetch REAL NASA POWER daily data for Al Ain into the climate_daily cache.
// Run: bun scripts/fetch-power.ts
// Nothing is fabricated: -999 fill values become null; days without the full
// parameter set get et0 = null and the UI says so.

import { syncPowerToDb } from "../src/lib/crop/power-sync";
import { db } from "../src/lib/db";

const LAT = 24.21;
const LON = 55.76;
const START = "20150101";
const END = "20261115";

async function main() {
  console.log(`Fetching NASA POWER daily data for ${LAT},${LON} ${START}..${END} ...`);
  const r = await syncPowerToDb(LAT, LON, START, END);
  if (!r.ok) {
    console.error("SYNC FAILED:", r.message);
    process.exit(1);
  }
  const count = await db.climateDaily.count();
  const withEt0 = await db.climateDaily.count({ where: { et0Mm: { not: null } } });
  const meta = await db.setting.findUnique({ where: { key: "nasa_power_meta" } });
  console.log(`Rows upserted this sync: ${r.rows}`);
  console.log(`Total climate_daily rows: ${count} (with ET0: ${withEt0})`);
  console.log("Meta:", meta?.valueJson);
  process.exit(0);
}

main();
