import { randomUUID } from "crypto";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { RepositoryDBService } from "../../../db/services/repository.js";
import {
  DuplicateFileError,
  FileDBService,
} from "../../../db/services/file.js";
import { files } from "../../../db/schema.js";
import { createTestDb, type TestDbContext } from "../../fixtures/testDb.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRepositoryService(ctx: TestDbContext): RepositoryDBService {
  return new RepositoryDBService(ctx.db);
}

function makeService(ctx: TestDbContext): FileDBService {
  return new FileDBService(ctx.db);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FileDBService", () => {
  let ctx!: TestDbContext;
  let repositoryService!: RepositoryDBService;
  let service!: FileDBService;

  beforeEach(async () => {
    ctx = await createTestDb();
    repositoryService = makeRepositoryService(ctx);
    service = makeService(ctx);
  });

  afterEach(async () => {
    await ctx.cleanup();

    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // createFile()
  // ---------------------------------------------------------------------------

  describe("createFile()", () => {
    it("creates a tracked file with repository, path, and hash", async () => {
      const repository = await repositoryService.createRepository({
        name: "CodeAtlas",
        path: "/tmp/codeatlas",
      });

      const created = await service.createFile({
        repositoryId: repository.id,
        path: "src/index.ts",
        hash: "file-hash-1",
      });

      expect(created.id).toBeDefined();
      expect(created.repositoryId).toBe(repository.id);
      expect(created.path).toBe("src/index.ts");
      expect(created.hash).toBe("file-hash-1");
      expect(created.createdAt).toBeInstanceOf(Date);
      expect(created.updatedAt).toBeInstanceOf(Date);

      const rows = await ctx.db.select().from(files);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(created.id);
    });

    it("throws DuplicateFileError when the repository path already exists", async () => {
      const repository = await repositoryService.createRepository({
        name: "CodeAtlas",
        path: "/tmp/codeatlas",
      });

      await service.createFile({
        repositoryId: repository.id,
        path: "src/index.ts",
        hash: "file-hash-1",
      });

      const duplicateAttempt = service.createFile({
        repositoryId: repository.id,
        path: "src/index.ts",
        hash: "file-hash-2",
      });

      await expect(duplicateAttempt).rejects.toBeInstanceOf(DuplicateFileError);
      await expect(duplicateAttempt).rejects.toMatchObject({
        message: `File already tracked for repository ${repository.id}: src/index.ts`,
        name: "DuplicateFileError",
        repositoryId: repository.id,
        path: "src/index.ts",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // updateFile()
  // ---------------------------------------------------------------------------

  describe("updateFile()", () => {
    it("updates only provided fields on an existing file", async () => {
      const repository = await repositoryService.createRepository({
        name: "CodeAtlas",
        path: "/tmp/codeatlas",
      });

      const created = await service.createFile({
        repositoryId: repository.id,
        path: "src/index.ts",
        hash: "file-hash-1",
      });

      const updated = await service.updateFile(created.id, {
        path: "src/main.ts",
      });

      expect(updated).not.toBeNull();
      expect(updated?.id).toBe(created.id);
      expect(updated?.repositoryId).toBe(repository.id);
      expect(updated?.path).toBe("src/main.ts");
      expect(updated?.hash).toBe("file-hash-1");
    });

    it("returns null when the file id does not exist", async () => {
      const updated = await service.updateFile(randomUUID(), {
        hash: "file-hash-2",
      });

      expect(updated).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getFileByRepositoryAndPath()
  // ---------------------------------------------------------------------------

  describe("getFileByRepositoryAndPath()", () => {
    it("returns the file matching the repository and path", async () => {
      const repository = await repositoryService.createRepository({
        name: "CodeAtlas",
        path: "/tmp/codeatlas",
      });

      const created = await service.createFile({
        repositoryId: repository.id,
        path: "src/index.ts",
        hash: "file-hash-1",
      });

      const file = await service.getFileByRepositoryAndPath(
        repository.id,
        "src/index.ts",
      );

      expect(file).not.toBeNull();
      expect(file?.id).toBe(created.id);
      expect(file?.repositoryId).toBe(repository.id);
      expect(file?.path).toBe("src/index.ts");
      expect(file?.hash).toBe("file-hash-1");
    });

    it("returns null when the repository and path do not match", async () => {
      const repository = await repositoryService.createRepository({
        name: "CodeAtlas",
        path: "/tmp/codeatlas",
      });

      await service.createFile({
        repositoryId: repository.id,
        path: "src/index.ts",
        hash: "file-hash-1",
      });

      const file = await service.getFileByRepositoryAndPath(
        repository.id,
        "src/missing.ts",
      );

      expect(file).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // removeFile()
  // ---------------------------------------------------------------------------

  describe("removeFile()", () => {
    it("returns true and deletes the file when id exists", async () => {
      const repository = await repositoryService.createRepository({
        name: "CodeAtlas",
        path: "/tmp/codeatlas",
      });

      const created = await service.createFile({
        repositoryId: repository.id,
        path: "src/index.ts",
        hash: "file-hash-1",
      });

      const removed = await service.removeFile(created.id);
      expect(removed).toBe(true);

      const rows = await ctx.db.select().from(files);
      expect(rows).toHaveLength(0);
    });

    it("returns false when the file id does not exist", async () => {
      const removed = await service.removeFile(randomUUID());
      expect(removed).toBe(false);
    });
  });
});
