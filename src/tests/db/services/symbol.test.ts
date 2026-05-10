import { randomUUID } from "crypto";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { RepositoryDBService } from "../../../db/services/repository.js";
import { SymbolDBService } from "../../../db/services/symbol.js";
import { symbols } from "../../../db/schema.js";
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

      const created = await service.createSymbol({
        repositoryId: repository.id,
        symbol: "RepositoryDBService",
        file: "src/db/services/repository.ts",
        type: "class",
        visibility: "public",
        blurb: "Handles repository database operations.",
        implementation: "Wraps repository inserts, updates, and deletes.",
        tags: ["repository", "database"],
      });

      expect(created.id).toBeDefined();
      expect(created.repositoryId).toBe(repository.id);
      expect(created.file).toBe("src/db/services/repository.ts");
      expect(created.tags).toEqual(["repository", "database"]);

      const rows = await ctx.db.select().from(symbols);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.file).toBe("src/db/services/repository.ts");
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
      const created = await service.createSymbol({
        repositoryId: repository.id,
        symbol: "RepositoryDBService",
        file: "src/db/services/repository.ts",
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

      const created = await service.upsertSymbol({
        repositoryId: repository.id,
        symbol: "RepositoryDBService",
        file: "src/db/services/repository.ts",
        type: "class",
        visibility: "public",
        blurb: "Original blurb",
      });

      const upserted = await service.upsertSymbol({
        repositoryId: repository.id,
        symbol: "RepositoryDBService",
        file: "src/db/services/repository.ts",
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

      const first = await service.upsertSymbol({
        repositoryId: repository.id,
        symbol: "bootstrap",
        file: "src/index.ts",
        type: "function",
        visibility: "public",
      });

      const second = await service.upsertSymbol({
        repositoryId: repository.id,
        symbol: "bootstrap",
        file: "src/mcp/index.ts",
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
      const created = await service.createSymbol({
        repositoryId: repository.id,
        symbol: "RepositoryDBService",
        file: "src/db/services/repository.ts",
        type: "class",
        visibility: "public",
      });

      const updated = await service.updateSymbol(created.id, {
        file: "src/db/services/repository.v2.ts",
      });

      expect(updated).not.toBeNull();
      expect(updated?.id).toBe(created.id);
      expect(updated?.file).toBe("src/db/services/repository.v2.ts");
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
      const created = await service.createSymbol({
        repositoryId: repository.id,
        symbol: "RepositoryDBService",
        file: "src/db/services/repository.ts",
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
