import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

// The verification log's hash-chain append needs a real interactive
// transaction (BEGIN; SELECT ... FOR UPDATE; INSERT; COMMIT) to serialize
// concurrent writers per firm. drizzle-orm/neon-http (used by getDb() in
// lib/db/index.ts) issues one HTTP request per query and cannot do this —
// so write paths that need transactional locking go through this
// WebSocket-based pool instead. Plain reads should keep using getDb().
let cachedPool: Pool | undefined;
let cachedDb: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getPoolDb() {
  if (!cachedDb) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set");
    }
    cachedPool = new Pool({ connectionString: process.env.DATABASE_URL });
    cachedDb = drizzle(cachedPool, { schema });
  }
  return cachedDb;
}
