import { describe, expect, it, afterEach, vi } from "vitest";
import {
  RepositoryIndexingError,
  RepositoryNotFoundError,
  type CreateRepositoryInput,
} from "../../models/Repository.js";
import {
  RepositoryOrchestratorService,
  type RepositoryOrchestratorServiceConfig,
} from "../../services/Repository.js";
import { Watcher } from "../../services/Watcher.js";
import { createMockRepoDBService } from "../fixtures/mockRepoDBService.js";
import { createMockRepositoryIndexerService } from "../fixtures/mockRepositoryIndexerService.js";
import { createMockFileReindexService } from "../fixtures/mockFileReindexService.js";

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

function makeRepositoryService(config: RepositoryOrchestratorServiceConfig) {
  return new RepositoryOrchestratorService(config);
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
      const repositoryDBService = createMockRepoDBService();
      const repositoryIndexerService = createMockRepositoryIndexerService();
      const fileReindexService = createMockFileReindexService();
      const watcher = makeWatcherMock();
      const service = makeRepositoryService({
        repositoryDBService,
        repositoryIndexerService,
        fileReindexService,
        watcher: watcher as unknown as Watcher,
      });
      const createdRepository = {
        id: "repo-0",
        name: "CodeAtlas",
        path: process.cwd(),
        createdAt: new Date(),
      };

      repositoryDBService.createRepository.mockResolvedValue(createdRepository);
      repositoryDBService.removeRepository.mockResolvedValue(true);
      repositoryIndexerService.indexRepository.mockRejectedValue(
        new Error("index not implemented"),
      );
      fileReindexService.registerOnFileShouldBeReindexed.mockImplementation(
        () => undefined,
      );

      const trackAttempt = service.trackRepository(makeRepositoryInput());

      await expect(trackAttempt).rejects.toBeInstanceOf(
        RepositoryIndexingError,
      );
      await expect(trackAttempt).rejects.toMatchObject({
        repositoryId: "repo-0",
        message:
          "Failed to index repository repo-0 during repository reindex: index not implemented",
      });

      expect(repositoryIndexerService.indexRepository).toHaveBeenCalledWith(
        createdRepository,
      );
      expect(
        fileReindexService.registerOnFileShouldBeReindexed,
      ).toHaveBeenCalledWith(expect.any(Function));
      expect(repositoryDBService.removeRepository).toHaveBeenCalledWith(
        "repo-0",
      );
      expect(watcher.stop).toHaveBeenCalledWith("repo-0");
    });
  });

  // ---------------------------------------------------------------------------
  // untrackRepository()
  // ---------------------------------------------------------------------------

  describe("untrackRepository()", () => {
    it("stops the watcher and removes an existing repository", async () => {
      const repositoryDBService = createMockRepoDBService();
      const repositoryIndexerService = createMockRepositoryIndexerService();
      const fileReindexService = createMockFileReindexService();
      const watcher = makeWatcherMock();
      const service = makeRepositoryService({
        repositoryDBService,
        repositoryIndexerService,
        fileReindexService,
        watcher: watcher as unknown as Watcher,
      });

      repositoryDBService.getRepository.mockResolvedValue({
        id: "repo-3",
        name: "CodeAtlas",
        path: process.cwd(),
        createdAt: new Date(),
      });
      repositoryDBService.removeRepository.mockResolvedValue(true);
      fileReindexService.registerOnFileShouldBeReindexed.mockImplementation(
        () => undefined,
      );

      await service.untrackRepository("repo-3");

      expect(watcher.stop).toHaveBeenCalledWith("repo-3");
      expect(repositoryDBService.removeRepository).toHaveBeenCalledWith(
        "repo-3",
      );
    });

    it("throws RepositoryNotFoundError when the repository does not exist", async () => {
      const repositoryDBService = createMockRepoDBService();
      const repositoryIndexerService = createMockRepositoryIndexerService();
      const fileReindexService = createMockFileReindexService();
      const watcher = makeWatcherMock();
      const service = makeRepositoryService({
        repositoryDBService,
        repositoryIndexerService,
        fileReindexService,
        watcher: watcher as unknown as Watcher,
      });

      repositoryDBService.getRepository.mockResolvedValue(null);
      fileReindexService.registerOnFileShouldBeReindexed.mockImplementation(
        () => undefined,
      );

      await expect(service.untrackRepository("missing")).rejects.toBeInstanceOf(
        RepositoryNotFoundError,
      );
      expect(watcher.stop).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // watcher callback wiring
  // ---------------------------------------------------------------------------

  describe("watcher wiring", () => {
    it("forwards update events to the file reindex service", async () => {
      const repositoryDBService = createMockRepoDBService();
      const repositoryIndexerService = createMockRepositoryIndexerService();
      const fileReindexService = createMockFileReindexService();
      const watcher = makeWatcherMock();
      const service = makeRepositoryService({
        repositoryDBService,
        repositoryIndexerService,
        fileReindexService,
        watcher: watcher as unknown as Watcher,
      });
      const createdRepository = {
        id: "repo-6",
        name: "CodeAtlas",
        path: process.cwd(),
        createdAt: new Date(),
      };

      repositoryDBService.createRepository.mockResolvedValue(createdRepository);
      repositoryDBService.removeRepository.mockResolvedValue(true);
      repositoryIndexerService.indexRepository.mockResolvedValue(undefined);
      fileReindexService.registerOnFileShouldBeReindexed.mockImplementation(
        () => undefined,
      );
      watcher.start.mockResolvedValue(undefined);

      await service.trackRepository(makeRepositoryInput());

      const watcherConfig = watcher.start.mock.calls[0]?.[0];

      watcherConfig.onUpdate("/tmp/example.ts");

      expect(fileReindexService.fileWasUpdated).toHaveBeenCalledWith(
        "/tmp/example.ts",
      );
    });
  });
});
