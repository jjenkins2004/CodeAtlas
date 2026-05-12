import { randomUUID } from "crypto";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { RepositoryDBService } from "../../../db/services/repository.js";
import { SymbolDBService } from "../../../db/services/symbol.js";
import { files, symbols } from "../../../db/schema.js";
import { createTestDb, type TestDbContext } from "../../fixtures/testDb.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRepositoryService(ctx: TestDbContext): RepositoryDBService {
  return new RepositoryDBService(ctx.db);
}

function makeSymbolService(ctx: TestDbContext): SymbolDBService {
  return new SymbolDBService(ctx.db);
}

async function createFile(
  ctx: TestDbContext,
  repositoryId: string,
  path: string,
  hash = "file-hash-1",
): Promise<string> {
  const [created] = await ctx.db
    .insert(files)
    .values({
      repositoryId,
      path,
      hash,
    })
    .returning({ id: files.id });

  return created.id;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SymbolDBService", () => {
  let ctx!: TestDbContext;
  let repositoryService: RepositoryDBService;
  let service: SymbolDBService;

  beforeEach(async () => {
    ctx = await createTestDb();
    repositoryService = makeRepositoryService(ctx);
    service = makeSymbolService(ctx);
  });

  afterEach(async () => {
    await ctx.cleanup();

    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // createSymbol()
  // ---------------------------------------------------------------------------

  describe("createSymbol()", () => {
    it("creates a symbol with its exact file path", async () => {
      const repository = await repositoryService.createRepository({
        name: "CodeAtlas",
        path: "/tmp/codeatlas",
      });
      const fileId = await createFile(
        ctx,
        repository.id,
        "src/db/services/repository.ts",
      );

      const created = await service.createSymbol({
        repositoryId: repository.id,
        symbol: "RepositoryDBService",
        fileId,
        hash: "symbol-hash-1",
        type: "class",
        visibility: "public",
        blurb: "Handles repository database operations.",
        implementation: "Wraps repository inserts, updates, and deletes.",
        tags: ["repository", "database"],
      });

      expect(created.id).toBeDefined();
      expect(created.repositoryId).toBe(repository.id);
      expect(created.fileId).toBe(fileId);
      expect(created.hash).toBe("symbol-hash-1");
      expect(created.tags).toEqual(["repository", "database"]);

      const rows = await ctx.db.select().from(symbols);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.fileId).toBe(fileId);
    });
  });

  // ---------------------------------------------------------------------------
  // getSymbol()
  // ---------------------------------------------------------------------------

  describe("getSymbol()", () => {
    it("returns a symbol by id", async () => {
      const repository = await repositoryService.createRepository({
        name: "CodeAtlas",
        path: "/tmp/codeatlas",
      });
      const fileId = await createFile(
        ctx,
        repository.id,
        "src/db/services/repository.ts",
      );
      const created = await service.createSymbol({
        repositoryId: repository.id,
        symbol: "RepositoryDBService",
        fileId,
        hash: "symbol-hash-2",
        type: "class",
        visibility: "public",
      });

      const found = await service.getSymbol(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.tags).toEqual([]);
    });

    it("returns null when the symbol id does not exist", async () => {
      const found = await service.getSymbol(randomUUID());

      expect(found).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // upsertSymbol()
  // ---------------------------------------------------------------------------

  describe("upsertSymbol()", () => {
    it("updates the existing symbol when repository, symbol, and file match", async () => {
      const repository = await repositoryService.createRepository({
        name: "CodeAtlas",
        path: "/tmp/codeatlas",
      });
      const fileId = await createFile(
        ctx,
        repository.id,
        "src/db/services/repository.ts",
      );

      const created = await service.upsertSymbol({
        repositoryId: repository.id,
        symbol: "RepositoryDBService",
        fileId,
        hash: "symbol-hash-3",
        type: "class",
        visibility: "public",
        blurb: "Original blurb",
      });

      const upserted = await service.upsertSymbol({
        repositoryId: repository.id,
        symbol: "RepositoryDBService",
        fileId,
        hash: "symbol-hash-3",
        type: "class",
        visibility: "public",
        blurb: "Updated blurb",
        tags: ["updated"],
      });

      expect(upserted.id).toBe(created.id);
      expect(upserted.blurb).toBe("Updated blurb");
      expect(upserted.tags).toEqual(["updated"]);

      const rows = await ctx.db.select().from(symbols);
      expect(rows).toHaveLength(1);
    });

    it("treats file path as part of the symbol identity", async () => {
      const repository = await repositoryService.createRepository({
        name: "CodeAtlas",
        path: "/tmp/codeatlas",
      });
      const firstFileId = await createFile(ctx, repository.id, "src/index.ts");
      const secondFileId = await createFile(
        ctx,
        repository.id,
        "src/mcp/index.ts",
        "file-hash-2",
      );

      const first = await service.upsertSymbol({
        repositoryId: repository.id,
        symbol: "bootstrap",
        fileId: firstFileId,
        hash: "symbol-hash-4",
        type: "function",
        visibility: "public",
      });

      const second = await service.upsertSymbol({
        repositoryId: repository.id,
        symbol: "bootstrap",
        fileId: secondFileId,
        hash: "symbol-hash-5",
        type: "function",
        visibility: "public",
      });

      expect(second.id).not.toBe(first.id);

      const rows = await ctx.db.select().from(symbols);
      expect(rows).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // updateSymbol()
  // ---------------------------------------------------------------------------

  describe("updateSymbol()", () => {
    it("updates only provided fields on an existing symbol", async () => {
      const repository = await repositoryService.createRepository({
        name: "CodeAtlas",
        path: "/tmp/codeatlas",
      });
      const fileId = await createFile(
        ctx,
        repository.id,
        "src/db/services/repository.ts",
      );
      const created = await service.createSymbol({
        repositoryId: repository.id,
        symbol: "RepositoryDBService",
        fileId,
        hash: "symbol-hash-6",
        type: "class",
        visibility: "public",
      });

      const updated = await service.updateSymbol(created.id, {
        fileId,
      });

      expect(updated).not.toBeNull();
      expect(updated?.id).toBe(created.id);
      expect(updated?.fileId).toBe(fileId);
      expect(updated?.symbol).toBe("RepositoryDBService");
    });
  });

  // ---------------------------------------------------------------------------
  // removeSymbol()
  // ---------------------------------------------------------------------------

  describe("removeSymbol()", () => {
    it("returns true and deletes the symbol when id exists", async () => {
      const repository = await repositoryService.createRepository({
        name: "CodeAtlas",
        path: "/tmp/codeatlas",
      });
      const fileId = await createFile(
        ctx,
        repository.id,
        "src/db/services/repository.ts",
      );
      const created = await service.createSymbol({
        repositoryId: repository.id,
        symbol: "RepositoryDBService",
        fileId,
        hash: "symbol-hash-7",
        type: "class",
        visibility: "public",
      });

      const removed = await service.removeSymbol(created.id);

      expect(removed).toBe(true);

      const rows = await ctx.db.select().from(symbols);
      expect(rows).toHaveLength(0);
    });

    it("returns false when the symbol id does not exist", async () => {
      const removed = await service.removeSymbol(randomUUID());

      expect(removed).toBe(false);
    });
  });
});
