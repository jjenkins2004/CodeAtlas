---
description: "CodeAtlas project context and coding guidelines. Always apply when working on CodeAtlas."
applyTo: "**"
---

# CodeAtlas — Project Overview

CodeAtlas is a TypeScript/Node.js service that indexes a codebase's public symbols (functions, classes, etc.) into a PostgreSQL + pgvector database and exposes them via a semantic search API and MCP server. The goal is to reduce agent token usage by returning only the most relevant symbol interfaces for a given "logic bit" query.

## Architecture

| Layer      | Path            | Purpose                                                                 |
| ---------- | --------------- | ----------------------------------------------------------------------- |
| HTTP API   | `src/server/`   | Express routes for track, untrack, reindex, and symbol management       |
| MCP Server | `src/mcp/`      | MCP server exposing search and tracking tools to agents                 |
| Services   | `src/services/` | File watcher (`Watcher.ts`) and gitignore filtering (`IgnoreFilter.ts`) |
| Models     | `src/models/`   | Drizzle ORM models: `Repository`, `Symbol`                              |
| DB         | `src/db/`       | Drizzle client, schema, and migrations                                  |

## Key Concepts

- **Symbol**: The atomic unit. Each public function, class, protocol, etc. extracted by tree-sitter gets a record with: `symbol`, `file`, `type`, `visibility`, `blurb` (≤50 words), `implementation` (≤150 words), and `tags` (short semantic strings like `"string to date"`).
- **Embedding format**: Symbols are embedded as structured text — `symbol:`, `type:`, `blurb:`, `implementation:`, `tags:` — then stored as pgvector embeddings for cosine similarity search.
- **Repository tracking**: Repositories are registered by name + path. The watcher monitors file changes and respects `.gitignore` rules via `IgnoreFilter`.
- **Reindex**: Full crawl of all non-ignored files using tree-sitter to extract and upsert symbols. Also available at file/folder granularity.

## Conventions

- **Language**: TypeScript, strict mode. No `any` unless unavoidable.
- **ORM**: Drizzle. Do not write raw SQL unless Drizzle cannot express it.
- **Validation**: Use the `src/server/validation.ts` patterns for request validation.
- **Error handling**: Use `src/server/middleware/errorHandler.ts` — throw typed errors, don't `res.status()` inline in route handlers.
- **Tests**: Vitest. Test files live in `src/tests/` mirroring the source structure. Use fixtures from `src/tests/fixtures/`.
- **Symbol blurb**: ≤50 words, plain language, what it does — not how.
- **Symbol implementation**: ≤150 words, how it works internally at its own scope only — do not describe owned sub-functions.
- **Tags**: Short phrase tags, e.g. `"date parsing"`, `"fetch image by id"`.

## Build & Test

```bash
npm install       # install dependencies
npm run build     # compile TypeScript
npm test          # run Vitest tests
```
