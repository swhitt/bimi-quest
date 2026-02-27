/**
 * One-time migration: enable pg_trgm and create trigram GIN indexes
 * for fast ILIKE search on subject_cn, subject_org, and san_list.
 *
 * Run: bun run db:trgm
 */
import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function migrate() {
  console.log("Enabling pg_trgm extension...");
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;

  console.log("Creating trigram GIN indexes...");
  await sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_certs_subject_cn_trgm
    ON certificates USING gin (subject_cn gin_trgm_ops)`;
  await sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_certs_subject_org_trgm
    ON certificates USING gin (subject_org gin_trgm_ops)`;

  console.log("Done.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
