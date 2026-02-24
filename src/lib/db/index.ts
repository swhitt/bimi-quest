import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Lazy singleton: only connects when first accessed (avoids build-time errors)
let _db: NeonHttpDatabase<typeof schema> | null = null;

export function getDb(): NeonHttpDatabase<typeof schema> {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL environment variable is not set");
    const sql = neon(url);
    _db = drizzle({ client: sql, schema });
  }
  return _db;
}

// For backwards compatibility: proxy that lazily initializes
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

/** Create a new db instance with a specific connection string (for workers) */
export function createDb(connectionString: string) {
  const client = neon(connectionString);
  return drizzle({ client, schema });
}
