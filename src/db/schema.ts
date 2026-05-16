import {
  index,
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  unique,
  vector,
} from "drizzle-orm/pg-core";
import path from "node:path";
import type pg from "pg";
import type { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { migrate as migrateNodePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { SYMBOL_TYPES, VISIBILITY_LEVELS } from "../models/Symbol.js";
import { createLogger } from "../services/util/Logger.js";

const logger = createLogger({ component: "db-schema" });

/**
 * Enum for symbol types extracted by tree-sitter.
 */
export const symbolTypeEnum = pgEnum("symbol_type", [...SYMBOL_TYPES]);

/**
 * Enum for symbol visibility levels.
 */
export const visibilityEnum = pgEnum("visibility", [...VISIBILITY_LEVELS]);

/**
 * Repositories table — tracks codebases being indexed.
 */
export const repositories = pgTable("repositories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  path: text("path").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Files table — stores the latest known hash for each tracked file.
 */
export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    hash: text("hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("files_repository_path_unique").on(table.repositoryId, table.path),
  ],
);

/**
 * Symbols table — stores extracted public symbols and their embeddings.
 */
export const symbols = pgTable(
  "symbols",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),

    // Tree-sitter extracted
    symbol: text("symbol").notNull(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    hash: text("hash").notNull(),
    type: symbolTypeEnum("type").notNull(),
    visibility: visibilityEnum("visibility").notNull().default("public"),

    // LLM generated
    blurb: text("blurb"),
    implementation: text("implementation"),
    tags: text("tags").array(),

    // pgvector embedding (1536-dim for text-embedding-3-small)
    embedding: vector("embedding", { dimensions: 1536 }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("symbols_repository_symbol_file_unique").on(
      table.repositoryId,
      table.symbol,
      table.fileId,
    ),
    index("symbols_embedding_cosine_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

const MIGRATIONS_FOLDER = path.resolve(process.cwd(), "src/db/migrations");
const EXTENSION_HARNESS_SQL = [
  "CREATE EXTENSION IF NOT EXISTS vector;",
  "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
];

export interface InitializeSchemaOptions {
  isMemory: boolean;
  pool: pg.Pool | null;
  pglite: PGlite | null;
}

async function initializePGLite(pglite: PGlite): Promise<void> {
  for (const statement of EXTENSION_HARNESS_SQL) {
    try {
      await pglite.exec(statement);
    } catch {
      // PGlite may expose extensions without supporting CREATE EXTENSION.
      logger.debug(
        { statement },
        "Skipping unsupported extension statement for PGlite",
      );
    }
  }

  const db = drizzlePglite(pglite);
  await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

async function initializeNodePg(pool: pg.Pool): Promise<void> {
  for (const statement of EXTENSION_HARNESS_SQL) {
    await pool.query(statement);
  }

  const db = drizzleNodePg(pool);
  await migrateNodePg(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

export async function initializeSchema({
  isMemory: _isMemory,
  pool,
  pglite,
}: InitializeSchemaOptions): Promise<void> {
  if (pglite) {
    await initializePGLite(pglite);

    return;
  }

  if (pool) {
    await initializeNodePg(pool);

    return;
  }

  throw new Error(
    "Database initialization requires a PGlite instance or Postgres pool.",
  );
}
