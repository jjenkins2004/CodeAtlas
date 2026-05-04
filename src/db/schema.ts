/**
 * SQL DDL for the CodeAtlas schema.
 * Run once against the target PostgreSQL database to initialise tables.
 * Requires the pgvector extension to be installed beforehand:
 *   CREATE EXTENSION IF NOT EXISTS vector;
 */
export const SCHEMA_SQL = /* sql */ `
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  CREATE EXTENSION IF NOT EXISTS vector;

  CREATE TABLE IF NOT EXISTS repositories (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       TEXT NOT NULL,
    path       TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TYPE symbol_type AS ENUM (
    'function', 'class', 'interface', 'enum', 'type',
    'constant', 'method', 'property', 'protocol', 'struct', 'unknown'
  );

  CREATE TYPE visibility AS ENUM (
    'public', 'internal', 'private', 'protected'
  );

  CREATE TABLE IF NOT EXISTS symbols (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id   UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,

    -- tree-sitter extracted
    symbol          TEXT NOT NULL,
    file            TEXT NOT NULL,
    type            symbol_type NOT NULL DEFAULT 'unknown',
    visibility      visibility  NOT NULL DEFAULT 'public',

    -- LLM generated
    blurb           TEXT,
    implementation  TEXT,
    tags            TEXT[] NOT NULL DEFAULT '{}',

    -- pgvector embedding (1536-dim for text-embedding-3-small)
    embedding       vector(1536),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (repository_id, symbol, file)
  );

  CREATE INDEX IF NOT EXISTS symbols_embedding_idx
    ON symbols USING hnsw (embedding vector_cosine_ops);

  CREATE INDEX IF NOT EXISTS symbols_repository_id_idx
    ON symbols (repository_id);
`;
