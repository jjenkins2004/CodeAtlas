import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;
let dbClient: ReturnType<typeof drizzle> | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env["DB_HOST"] ?? "localhost",
      port: parseInt(process.env["DB_PORT"] ?? "5432", 10),
      database: process.env["DB_NAME"] ?? "codeatlas",
      user: process.env["DB_USER"] ?? "postgres",
      password: process.env["DB_PASSWORD"],
      max: 10,
    });
  }
  return pool;
}

export function getDatabase() {
  if (!dbClient) {
    dbClient = drizzle(getPool(), { schema });
  }
  return dbClient;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
  dbClient = null;
}
