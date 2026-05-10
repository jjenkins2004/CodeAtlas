import pg from "pg";
import { DatabaseClientManager, type DatabaseClient } from "../../db/client.js";

export interface TestDbContext {
  db: DatabaseClient;
  cleanup: () => Promise<void>;
}

/**
 * Creates a real Postgres database client for integration tests.
 *
 * Expects a running Postgres instance reachable via TEST_DB_* env vars
 * (or falls back to the same defaults as the app).
 *
 * Bootstraps the full app schema before tests and tears down the pool
 * on cleanup.
 */
export async function createTestDb(): Promise<TestDbContext> {
  const memoryClientManager = DatabaseClientManager.create(true);
  await memoryClientManager.initializeSchema();

  return {
    db: memoryClientManager.getDatabase(),
    cleanup: async () => {
      await memoryClientManager.close();
    },
  };
}
