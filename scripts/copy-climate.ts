// One-off: copy the cached NASA POWER rows from local SQLite into Neon (fast, batched).
import { Database } from "bun:sqlite";
import { PrismaClient } from "@prisma/client";

const sqlite = new Database("db/custom.db", { readonly: true });
const prisma = new PrismaClient();

const rows = sqlite.query("SELECT * FROM ClimateDaily").all() as any[];
console.log(`Read ${rows.length} rows from db/custom.db`);

const data = rows.map((r) => ({
  date: r.date,
  tmax: r.tmax,
  tmin: r.tmin,
  tmean: r.tmean,
  rh: r.rh,
  wind2m: r.wind2m,
  solarMj: r.solarMj,
  rainMm: r.rainMm,
  et0Mm: r.et0Mm,
  source: r.source,
  fetchedAt: new Date(Number(r.fetchedAt)),
}));

let inserted = 0;
for (let i = 0; i < data.length; i += 1000) {
  const res = await prisma.climateDaily.createMany({
    data: data.slice(i, i + 1000),
    skipDuplicates: true,
  });
  inserted += res.count;
  console.log(`Batch ${i / 1000 + 1}: +${res.count}`);
}

const meta = sqlite.query("SELECT valueJson FROM Setting WHERE key = 'nasa_power_meta'").get() as any;
if (meta) {
  await prisma.setting.upsert({
    where: { key: "nasa_power_meta" },
    create: { key: "nasa_power_meta", valueJson: meta.valueJson },
    update: { valueJson: meta.valueJson },
  });
}

console.log(`Done. Inserted ${inserted}, total in Neon: ${await prisma.climateDaily.count()}`);
await prisma.$disconnect();
process.exit(0);
