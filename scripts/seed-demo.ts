// Seed the C.R.O.P. demo dataset (farm, nodes, SIMULATED sensor readings,
// calibrations, alerts, settings). Run: bun scripts/seed-demo.ts

import { seedDemoData } from "../src/lib/crop/seed";

async function main() {
  console.log("Seeding demo data (simulated sensors, real farm profile)...");
  const r = await seedDemoData();
  console.log(`Done: farm=${r.farmId} nodes=${r.nodes} readings=${r.readings} alerts=${r.alerts} (all sensor rows provenance=simulated)`);
  process.exit(0);
}

main();
