import { PrismaClient } from '@prisma/client'
import { copyFileSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Resolve a WRITABLE database URL.
 *
 * Standard mode on a host with a read-only filesystem (e.g. a container with
 * an immutable root): probe the database directory with a real file write; if
 * it fails, COPY the bundled SQLite file to a writable directory and point
 * Prisma at the copy (original file untouched). If even the copy fails, keep
 * the original URL — every DB query will then fail and /api/health reports
 * the database as UNAVAILABLE honestly (never silently degraded).
 *
 * Set PHYTOSENSE_DB_WRITABLE_COPY=0 to disable the probe/copy (e.g. you mount
 * the DB read-only on purpose in public-demo mode, where nothing is written).
 */
function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL ?? 'file:./db/custom.db'
  if (!raw.startsWith('file:')) return raw
  if (process.env.PHYTOSENSE_DB_WRITABLE_COPY === '0') return raw

  const dbPath = resolve(raw.slice('file:'.length))
  const probe = join(dirname(dbPath), `.db-write-probe-${process.pid}`)
  try {
    writeFileSync(probe, 'probe')
    unlinkSync(probe)
    return raw // directory is writable — use the database in place
  } catch {
    const dir = process.env.PHYTOSENSE_WRITABLE_DIR ?? join('/tmp', 'nabta-db')
    const target = join(dir, 'custom.db')
    try {
      if (!existsSync(target)) {
        mkdirSync(dir, { recursive: true })
        copyFileSync(dbPath, target)
      }
      // eslint-disable-next-line no-console
      console.warn(
        `[db] database directory is read-only (${dirname(dbPath)}); serving from a writable COPY at ${target}. Original file untouched.`
      )
      return 'file:' + target
    } catch (copyErr) {
      // eslint-disable-next-line no-console
      console.error(
        `[db] UNAVAILABLE: database directory is read-only and copying to a writable path failed: ${
          copyErr instanceof Error ? copyErr.message : String(copyErr)
        }`
      )
      return raw // queries will fail; /api/health reports UNAVAILABLE honestly
    }
  }
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG_QUERIES === '1' ? ['query'] : [],
    datasources: { db: { url: resolveDatabaseUrl() } },
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
