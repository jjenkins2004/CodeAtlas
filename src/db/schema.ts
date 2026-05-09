import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  vector,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Enum for symbol types extracted by tree-sitter.
 */
export const symbolTypeEnum = pgEnum("symbol_type", [
  "function",
  "class",
  "enum",
  "protocol",
  "method",
]);

/**
 * Enum for symbol visibility levels.
 */
export const visibilityEnum = pgEnum("visibility", [
  "public",
  "internal",
  "private",
]);

/**
 * Repositories table — tracks codebases being indexed.
 */
export const repositories = pgTable("repositories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  path: text("path").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Symbols table — stores extracted public symbols and their embeddings.
 */
export const symbols = pgTable("symbols", {
  id: uuid("id").primaryKey().defaultRandom(),
  repositoryId: uuid("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),

  // Tree-sitter extracted
  symbol: text("symbol").notNull(),
  file: text("file").notNull(),
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
});
