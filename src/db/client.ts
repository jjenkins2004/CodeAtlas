import pg from "pg";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import * as schema from "./schema.js";
import {
  initializeSchema as initializeDatabaseSchema,
} from "./schema.js";

const { Pool } = pg;
export type DatabaseClient =
  | NodePgDatabase<typeof schema>
  | PgliteDatabase<typeof schema>;

export class DatabaseClientManager {
  private readonly pool: pg.Pool | null;
  private readonly pglite: PGlite | null;
  private readonly isMemory: boolean;
  private dbClient: DatabaseClient | null = null;

  constructor(pool: pg.Pool, isMemory?: false);
  constructor(pool: null, isMemory: true, pglite: PGlite);
  constructor(
    pool: pg.Pool | null,
    isMemory = false,
    pglite: PGlite | null = null,
  ) {
    this.pool = pool;
    this.isMemory = isMemory;
    this.pglite = pglite;
  }

  static create(isMemory = false): DatabaseClientManager {
    if (isMemory) {
      const pglite = new PGlite({ extensions: { vector } });
      return new DatabaseClientManager(null, true, pglite);
    }

    return new DatabaseClientManager(
      new Pool({
        host: process.env["DB_HOST"] ?? "localhost",
        port: parseInt(process.env["DB_PORT"] ?? "5432", 10),
        database: process.env["DB_NAME"] ?? "codeatlas",
        user: process.env["DB_USER"] ?? "postgres",
        password: process.env["DB_PASSWORD"],
        max: 10,
      }),
      false,
    );
  }

  getPool(): pg.Pool {
    if (!this.pool) {
      throw new Error(
        "Pool is not available when using in-memory database mode.",
      );
    }

    return this.pool;
  }

  getDatabase(): DatabaseClient {
    if (!this.dbClient) {
      this.dbClient = this.isMemory
        ? drizzlePglite(this.pglite as PGlite, { schema })
        : drizzleNodePg(this.pool as pg.Pool, { schema });
    }

    return this.dbClient;
  }

  async initializeSchema(): Promise<void> {
    await initializeDatabaseSchema({
      isMemory: this.isMemory,
      pool: this.pool,
      pglite: this.pglite,
    });
  }

  async close(): Promise<void> {
    if (this.isMemory) {
      await (this.pglite as PGlite).close();
    } else {
      await (this.pool as pg.Pool).end();
    }

    this.dbClient = null;
  }
}

export const client = DatabaseClientManager.create(
  process.env["NODE_ENV"] === "test",
);
