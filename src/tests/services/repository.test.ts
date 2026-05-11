import { describe, expect, it, afterEach, vi } from "vitest";
import { repositoryDBService } from "../../db/services/repository.js";
import {
  RepositoryIndexingError,
  RepositoryNotFoundError,
  type CreateRepositoryInput,
} from "../../models/Repository.js";
import { RepositoryOrchestratorService } from "../../services/repository.js";
import { Watcher } from "../../services/Watcher.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWatcherMock() {
  return {
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function makeRepositoryInput(path = process.cwd()): CreateRepositoryInput {
  return {
    name: "CodeAtlas",
    path,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RepositoryOrchestratorService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // trackRepository()
  // ---------------------------------------------------------------------------

  describe("trackRepository()", () => {
    it("rolls back a repository when track step fails", async () => {
      const watcher = makeWatcherMock();
      const service = new RepositoryOrchestratorService(
        watcher as unknown as Watcher,
      );
      const createdRepository = {
        id: "repo-0",
        name: "CodeAtlas",
        path: process.cwd(),
        createdAt: new Date(),
      };

      vi.spyOn(repositoryDBService, "createRepository").mockResolvedValue(
        createdRepository,
      );
      const removeRepositorySpy = vi
        .spyOn(repositoryDBService, "removeRepository")
        .mockResolvedValue(true);

      const trackAttempt = service.trackRepository(makeRepositoryInput());

      await expect(trackAttempt).rejects.toBeInstanceOf(
        RepositoryIndexingError,
      );
      await expect(trackAttempt).rejects.toMatchObject({
        repositoryId: "repo-0",
        message:
          'Failed to index repository repo-0 during repository reindex: index not implemented',
      });

      expect(removeRepositorySpy).toHaveBeenCalledWith("repo-0");
      expect(watcher.stop).toHaveBeenCalledWith("repo-0");
    });
  });

  // ---------------------------------------------------------------------------
  // untrackRepository()
  // ---------------------------------------------------------------------------

  describe("untrackRepository()", () => {
    it("stops the watcher and removes an existing repository", async () => {
      const watcher = makeWatcherMock();
      const service = new RepositoryOrchestratorService(
        watcher as unknown as Watcher,
      );

      vi.spyOn(repositoryDBService, "getRepository").mockResolvedValue({
        id: "repo-3",
        name: "CodeAtlas",
        path: process.cwd(),
        createdAt: new Date(),
      });
      const removeRepositorySpy = vi
        .spyOn(repositoryDBService, "removeRepository")
        .mockResolvedValue(true);

      await service.untrackRepository("repo-3");

      expect(watcher.stop).toHaveBeenCalledWith("repo-3");
      expect(removeRepositorySpy).toHaveBeenCalledWith("repo-3");
    });

    it("throws RepositoryNotFoundError when the repository does not exist", async () => {
      const watcher = makeWatcherMock();
      const service = new RepositoryOrchestratorService(
        watcher as unknown as Watcher,
      );

      vi.spyOn(repositoryDBService, "getRepository").mockResolvedValue(null);

      await expect(service.untrackRepository("missing")).rejects.toBeInstanceOf(
        RepositoryNotFoundError,
      );
      expect(watcher.stop).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // listRepositories()
  // ---------------------------------------------------------------------------

  describe("listRepositories()", () => {
    it("returns all repositories from the database", async () => {
      const service = new RepositoryOrchestratorService(makeWatcherMock() as unknown as Watcher);

      const repositories = [
        {
          id: "repo-4",
          name: "CodeAtlas",
          path: process.cwd(),
          createdAt: new Date(),
        },
      ];

      vi.spyOn(repositoryDBService, "listRepositories").mockResolvedValue(
        repositories,
      );

      await expect(service.listRepositories()).resolves.toEqual(repositories);
    });
  });

  // ---------------------------------------------------------------------------
  // getRepository()
  // ---------------------------------------------------------------------------

  describe("getRepository()", () => {
    it("returns a repository when the id exists", async () => {
      const service = new RepositoryOrchestratorService(makeWatcherMock() as unknown as Watcher);
      const repository = {
        id: "repo-5",
        name: "CodeAtlas",
        path: process.cwd(),
        createdAt: new Date(),
      };

      vi.spyOn(repositoryDBService, "getRepository").mockResolvedValue(
        repository,
      );

      await expect(service.getRepository("repo-5")).resolves.toEqual(
        repository,
      );
    });

    it("returns null when the repository id does not exist", async () => {
      const service = new RepositoryOrchestratorService(makeWatcherMock() as unknown as Watcher);

      vi.spyOn(repositoryDBService, "getRepository").mockResolvedValue(null);

      await expect(service.getRepository("missing")).resolves.toBeNull();
    });
  });
});
