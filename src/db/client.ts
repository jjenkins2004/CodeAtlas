import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import * as schema from "./schema.js";
import { initializeSchema as initializeDatabaseSchema } from "./schema.js";
import { resolvePersistentDataDir } from "./utils.js";

const APP_NAME = "CodeAtlas";

export type DatabaseClient = PgliteDatabase<typeof schema>;

export class DatabaseClientManager {
  private readonly pglite: PGlite;
  private readonly isMemory: boolean;
  private dbClient: DatabaseClient | null = null;

  constructor(pglite: PGlite, isMemory = false) {
    this.isMemory = isMemory;
    this.pglite = pglite;
  }

  static create(isMemory = false): DatabaseClientManager {
    const pglite = isMemory
      ? new PGlite({ extensions: { vector } })
      : new PGlite(resolvePersistentDataDir(APP_NAME), {
          extensions: { vector },
        });

    return new DatabaseClientManager(pglite, isMemory);
  }

  getDatabase(): DatabaseClient {
    if (!this.dbClient) {
      this.dbClient = drizzlePglite(this.pglite, { schema });
    }

    return this.dbClient;
  }

  async initializeSchema(): Promise<void> {
    await initializeDatabaseSchema({
      isMemory: this.isMemory,
      pglite: this.pglite,
      pool: null,
    });
  }

  async close(): Promise<void> {
    await this.pglite.close();

    this.dbClient = null;
  }
}

export const client = DatabaseClientManager.create(
  process.env["NODE_ENV"] === "test",
);
