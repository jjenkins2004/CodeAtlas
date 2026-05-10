import { randomUUID } from "crypto";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DuplicateRepositoryError,
  RepositoryDBService,
} from "../../../db/services/repository.js";
import { repositories } from "../../../db/schema.js";
import { createTestDb, type TestDbContext } from "../../fixtures/testDb.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeService(ctx: TestDbContext): RepositoryDBService {
  return new RepositoryDBService(ctx.db);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RepositoryDBService", () => {
  let ctx!: TestDbContext;
  let service: RepositoryDBService;

  beforeEach(async () => {
    ctx = await createTestDb();
    service = makeService(ctx);
  });

  afterEach(async () => {
    await ctx.cleanup();

    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // createRepository()
  // ---------------------------------------------------------------------------

  describe("createRepository()", () => {
    it("creates a repository with name and path", async () => {
      const created = await service.createRepository({
        name: "CodeAtlas",
        path: "/tmp/codeatlas",
      });

      expect(created.id).toBeDefined();
      expect(created.name).toBe("CodeAtlas");
      expect(created.path).toBe("/tmp/codeatlas");
      expect(created.createdAt).toBeInstanceOf(Date);

      const rows = await ctx.db.select().from(repositories);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(created.id);
    });

    it("throws DuplicateRepositoryError when the repository path already exists", async () => {
      await service.createRepository({
        name: "First",
        path: "/tmp/shared",
      });

      const duplicateAttempt = service.createRepository({
        name: "Second",
        path: "/tmp/shared",
      });

      await expect(duplicateAttempt).rejects.toBeInstanceOf(
        DuplicateRepositoryError,
      );
      await expect(duplicateAttempt).rejects.toMatchObject({
        message: "Repository already tracked for path: /tmp/shared",
        name: "DuplicateRepositoryError",
        path: "/tmp/shared",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // updateRepository()
  // ---------------------------------------------------------------------------

  describe("updateRepository()", () => {
    it("updates only provided fields on an existing repository", async () => {
      const created = await service.createRepository({
        name: "Original",
        path: "/tmp/original",
      });

      const updated = await service.updateRepository(created.id, {
        name: "Renamed",
      });

      expect(updated).not.toBeNull();
      expect(updated?.id).toBe(created.id);
      expect(updated?.name).toBe("Renamed");
      expect(updated?.path).toBe("/tmp/original");
    });

    it("returns null when the repository id does not exist", async () => {
      const updated = await service.updateRepository(randomUUID(), {
        name: "Nope",
      });

      expect(updated).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // removeRepository()
  // ---------------------------------------------------------------------------

  describe("removeRepository()", () => {
    it("returns true and deletes the repository when id exists", async () => {
      const created = await service.createRepository({
        name: "ToDelete",
        path: "/tmp/delete-me",
      });

      const removed = await service.removeRepository(created.id);
      expect(removed).toBe(true);

      const rows = await ctx.db.select().from(repositories);
      expect(rows).toHaveLength(0);
    });

    it("returns false when the repository id does not exist", async () => {
      const removed = await service.removeRepository(randomUUID());
      expect(removed).toBe(false);
    });
  });
});
