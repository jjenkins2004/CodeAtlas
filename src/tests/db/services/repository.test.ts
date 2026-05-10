import { randomUUID } from "crypto";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { RepositoryDBService } from "../../../db/services/repository.js";
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

    it("rejects empty name or path values", async () => {
      await expect(
        service.createRepository({
          name: "",
          path: "/tmp/codeatlas",
        }),
      ).rejects.toThrowError("Repository name cannot be empty");

      await expect(
        service.createRepository({
          name: "CodeAtlas",
          path: "",
        }),
      ).rejects.toThrowError("Repository path cannot be empty");
    });

    it("rejects duplicate repository paths", async () => {
      await service.createRepository({
        name: "First",
        path: "/tmp/shared",
      });

      await expect(
        service.createRepository({
          name: "Second",
          path: "/tmp/shared",
        }),
      ).rejects.toThrowError("Repository path already exists");
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

    it("rejects empty update objects", async () => {
      const created = await service.createRepository({
        name: "Original",
        path: "/tmp/original",
      });

      await expect(
        service.updateRepository(created.id, {}),
      ).rejects.toThrowError("Repository update requires at least one field");
    });

    it("rejects empty name or path values", async () => {
      const created = await service.createRepository({
        name: "Original",
        path: "/tmp/original",
      });

      await expect(
        service.updateRepository(created.id, { name: "" }),
      ).rejects.toThrowError("Repository name cannot be empty");

      await expect(
        service.updateRepository(created.id, { path: "" }),
      ).rejects.toThrowError("Repository path cannot be empty");
    });

    it("rejects invalid repository ids", async () => {
      await expect(
        service.updateRepository("not-a-uuid", { name: "Renamed" }),
      ).rejects.toThrowError("Repository id must be a valid UUID");
    });

    it("returns null when the repository id does not exist", async () => {
      const updated = await service.updateRepository(randomUUID(), {
        name: "Nope",
      });

      expect(updated).toBeNull();
    });

    it("rejects duplicate repository paths", async () => {
      const first = await service.createRepository({
        name: "First",
        path: "/tmp/shared",
      });
      const second = await service.createRepository({
        name: "Second",
        path: "/tmp/other",
      });

      await expect(
        service.updateRepository(second.id, { path: first.path }),
      ).rejects.toThrowError("Repository path already exists");
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

    it("rejects invalid repository ids", async () => {
      await expect(service.removeRepository("not-a-uuid")).rejects.toThrowError(
        "Repository id must be a valid UUID",
      );
    });
  });
});
