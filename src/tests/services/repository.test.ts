import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RepositoryIndexingError,
  RepositoryNotFoundError,
  type CreateRepositoryInput,
  type Repository,
} from "../../models/Repository.js";
import { IgnoreFilter } from "../../services/util/IgnoreFilter.js";
import {
  RepositoryOrchestratorService,
  type RepositoryOrchestratorServiceConfig,
} from "../../services/Repository.js";
import { createMockFileUpdateService } from "../fixtures/mockFileUpdateService.js";
import { createMockRepoDBService } from "../fixtures/mockRepoDBService.js";
import { createMockRepositoryInitializerService } from "../fixtures/mockRepositoryInitializerService.js";
import { createMockRepositoryPathService } from "../fixtures/mockRepositoryPathService.js";
import { MockRepo } from "../fixtures/mockRepo.js";
import { createMockWatcher } from "../fixtures/mockWatcher.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type WatcherMock = ReturnType<typeof createMockWatcher>;

type ServiceDeps = {
  repositoryDBService: ReturnType<typeof createMockRepoDBService>;
  repositoryInitializerService: ReturnType<
    typeof createMockRepositoryInitializerService
  >;
  fileUpdateService: ReturnType<typeof createMockFileUpdateService>;
  repositoryPathService: ReturnType<typeof createMockRepositoryPathService>;
  watcher: WatcherMock;
  service: RepositoryOrchestratorService;
};

function makeRepositoryInput(inputPath = process.cwd()): CreateRepositoryInput {
  return {
    name: "CodeAtlas",
    path: inputPath,
  };
}

function makeRepository(overrides: Partial<Repository> = {}): Repository {
  return {
    id: "repo-1",
    name: "CodeAtlas",
    path: process.cwd(),
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeServiceDeps(
  config: Partial<RepositoryOrchestratorServiceConfig> = {},
): ServiceDeps {
  const repositoryDBService = createMockRepoDBService();
  const repositoryInitializerService = createMockRepositoryInitializerService();
  const fileUpdateService = createMockFileUpdateService();
  const repositoryPathService = createMockRepositoryPathService();
  const watcher = createMockWatcher();
  const service = new RepositoryOrchestratorService({
    repositoryDBService,
    repositoryInitializerService,
    fileUpdateService,
    repositoryPathService,
    watcher,
    ...config,
  });

  return {
    repositoryDBService,
    repositoryInitializerService,
    fileUpdateService,
    repositoryPathService,
    watcher,
    service,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RepositoryOrchestratorService", () => {
  let repos: MockRepo[];

  beforeEach(() => {
    repos = [];
  });

  afterEach(async () => {
    for (const repo of repos) {
      repo.cleanup();
    }

    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // trackRepository()
  // ---------------------------------------------------------------------------

  describe("trackRepository()", () => {
    it("creates a repository, starts the watcher, and indexes the repository", async () => {
      const repo = new MockRepo();
      const relativePath = path.relative(process.cwd(), repo.rootPath);
      const normalizedPath = path.resolve(relativePath);
      const createdRepository = makeRepository({
        id: "repo-10",
        path: normalizedPath,
      });
      const ignoreFilter = { ignores: vi.fn() };
      const ignoreFilterSpy = vi
        .spyOn(IgnoreFilter, "createFilter")
        .mockReturnValue(ignoreFilter as never);
      const {
        repositoryDBService,
        repositoryInitializerService,
        fileUpdateService,
        repositoryPathService,
        watcher,
        service,
      } = makeServiceDeps();

      repos.push(repo);
      vi.mocked(
        repositoryPathService.validateAndNormalizeRepositoryPath,
      ).mockResolvedValue(normalizedPath);
      repositoryDBService.createRepository.mockResolvedValue(createdRepository);
      repositoryInitializerService.initializeRepository.mockResolvedValue(
        undefined,
      );
      watcher.start.mockResolvedValue(undefined);

      const trackedRepository = await service.trackRepository(
        makeRepositoryInput(relativePath),
      );

      expect(trackedRepository).toEqual(createdRepository);
      expect(repositoryDBService.createRepository).toHaveBeenCalledWith({
        name: "CodeAtlas",
        path: normalizedPath,
      });
      expect(
        repositoryPathService.validateAndNormalizeRepositoryPath,
      ).toHaveBeenCalledWith(relativePath);
      expect(ignoreFilterSpy).toHaveBeenCalledWith(normalizedPath);
      expect(watcher.start).toHaveBeenCalledWith({
        repositoryId: "repo-10",
        rootPath: normalizedPath,
        ignoreFilter,
        onCreation: expect.any(Function),
        onUpdate: expect.any(Function),
        onDeletion: expect.any(Function),
      });
      expect(
        repositoryInitializerService.initializeRepository,
      ).toHaveBeenCalledWith("repo-10");
      expect(fileUpdateService.handleFileUpdate).not.toHaveBeenCalled();
      expect(repositoryDBService.removeRepository).not.toHaveBeenCalled();
    });

    it("forwards watcher events to the file update service", async () => {
      const repo = new MockRepo();
      const createdRepository = makeRepository({
        id: "repo-11",
        path: repo.rootPath,
      });
      const {
        repositoryDBService,
        repositoryInitializerService,
        fileUpdateService,
        repositoryPathService,
        watcher,
        service,
      } = makeServiceDeps();

      repos.push(repo);
      vi.mocked(
        repositoryPathService.validateAndNormalizeRepositoryPath,
      ).mockResolvedValue(repo.rootPath);
      repositoryDBService.createRepository.mockResolvedValue(createdRepository);
      repositoryInitializerService.initializeRepository.mockResolvedValue(
        undefined,
      );
      watcher.start.mockResolvedValue(undefined);

      await service.trackRepository(makeRepositoryInput(repo.rootPath));

      const watcherConfig = watcher.start.mock.calls[0]?.[0] as {
        onCreation: (relativePath: string) => void;
        onUpdate: (relativePath: string) => void;
        onDeletion: (relativePath: string) => void;
      };

      watcherConfig.onCreation("src/created.ts");
      watcherConfig.onUpdate("src/updated.ts");
      watcherConfig.onDeletion("src/deleted.ts");

      expect(fileUpdateService.handleFileUpdate).toHaveBeenCalledTimes(3);
      expect(fileUpdateService.handleFileUpdate).toHaveBeenNthCalledWith(
        1,
        "repo-11",
        repo.rootPath,
        "src/created.ts",
        "changed",
      );
      expect(fileUpdateService.handleFileUpdate).toHaveBeenNthCalledWith(
        2,
        "repo-11",
        repo.rootPath,
        "src/updated.ts",
        "changed",
      );
      expect(fileUpdateService.handleFileUpdate).toHaveBeenNthCalledWith(
        3,
        "repo-11",
        repo.rootPath,
        "src/deleted.ts",
        "deleted",
      );
    });

    it("rolls back and wraps watcher start failures", async () => {
      const repo = new MockRepo();
      const createdRepository = makeRepository({
        id: "repo-13",
        path: repo.rootPath,
      });
      const watcherError = new Error("watcher failed");
      const {
        repositoryDBService,
        repositoryInitializerService,
        fileUpdateService,
        repositoryPathService,
        watcher,
        service,
      } = makeServiceDeps();

      repos.push(repo);
      vi.mocked(
        repositoryPathService.validateAndNormalizeRepositoryPath,
      ).mockResolvedValue(repo.rootPath);
      repositoryDBService.createRepository.mockResolvedValue(createdRepository);
      repositoryDBService.removeRepository.mockResolvedValue(true);
      watcher.start.mockRejectedValue(watcherError);

      await expect(
        service.trackRepository(makeRepositoryInput(repo.rootPath)),
      ).rejects.toMatchObject({
        name: "RepositoryIndexingError",
        repositoryId: "repo-13",
        message: `Failed to index repository repo-13 during repository reindex: ${watcherError.message}`,
      });
      expect(watcher.stop).toHaveBeenCalledWith("repo-13");
      expect(fileUpdateService.removeRepository).toHaveBeenCalledWith(
        "repo-13",
      );
      expect(repositoryDBService.removeRepository).toHaveBeenCalledWith(
        "repo-13",
      );
      expect(
        repositoryInitializerService.initializeRepository,
      ).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // startTracking()
  // ---------------------------------------------------------------------------

  describe("startTracking()", () => {
    it("starts tracking an existing repository by name", async () => {
      const repo = new MockRepo();
      const repository = makeRepository({
        id: "repo-30",
        name: "Atlas",
        path: repo.rootPath,
      });
      const {
        repositoryDBService,
        repositoryInitializerService,
        fileUpdateService,
        repositoryPathService,
        watcher,
        service,
      } = makeServiceDeps();

      repos.push(repo);
      repositoryDBService.getRepositoryByName.mockResolvedValue(repository);
      repositoryPathService.walkDirectory.mockResolvedValue([
        "src/a.ts",
        "src/b.ts",
      ]);
      watcher.start.mockResolvedValue(undefined);

      const started = await service.startTracking("Atlas");

      expect(started).toEqual(repository);
      expect(repositoryDBService.getRepositoryByName).toHaveBeenCalledWith(
        "Atlas",
      );
      expect(watcher.start).toHaveBeenCalledWith({
        repositoryId: "repo-30",
        rootPath: repo.rootPath,
        ignoreFilter: expect.any(Object),
        onCreation: expect.any(Function),
        onUpdate: expect.any(Function),
        onDeletion: expect.any(Function),
      });
      expect(repositoryPathService.walkDirectory).toHaveBeenCalledWith(
        repo.rootPath,
      );
      expect(fileUpdateService.handleFileUpdate).toHaveBeenCalledTimes(2);
      expect(fileUpdateService.handleFileUpdate).toHaveBeenNthCalledWith(
        1,
        "repo-30",
        repo.rootPath,
        "src/a.ts",
        "changed",
      );
      expect(fileUpdateService.handleFileUpdate).toHaveBeenNthCalledWith(
        2,
        "repo-30",
        repo.rootPath,
        "src/b.ts",
        "changed",
      );
      expect(
        repositoryInitializerService.initializeRepository,
      ).not.toHaveBeenCalled();
    });

    it("throws RepositoryNotFoundError when repository name does not exist", async () => {
      const { repositoryDBService, watcher, service } = makeServiceDeps();

      repositoryDBService.getRepositoryByName.mockResolvedValue(null);

      await expect(service.startTracking("missing-name")).rejects.toEqual(
        new RepositoryNotFoundError("missing-name"),
      );
      expect(watcher.start).not.toHaveBeenCalled();
    });

    it("does not roll back repository record on startTracking failures", async () => {
      const repo = new MockRepo();
      const repository = makeRepository({
        id: "repo-31",
        name: "Atlas",
        path: repo.rootPath,
      });
      const watcherError = new Error("watcher failed");
      const { repositoryDBService, watcher, service } = makeServiceDeps();

      repos.push(repo);
      repositoryDBService.getRepositoryByName.mockResolvedValue(repository);
      watcher.start.mockRejectedValue(watcherError);

      await expect(service.startTracking("Atlas")).rejects.toMatchObject({
        name: "RepositoryIndexingError",
        repositoryId: "repo-31",
        message: `Failed to index repository repo-31 during repository reindex: ${watcherError.message}`,
      });
      expect(watcher.stop).toHaveBeenCalledWith("repo-31");
      expect(repositoryDBService.removeRepository).not.toHaveBeenCalled();
    });

    it("continues replay when one path enqueue fails", async () => {
      const repo = new MockRepo();
      const repository = makeRepository({
        id: "repo-32",
        name: "Atlas",
        path: repo.rootPath,
      });
      const enqueueError = new Error("enqueue failed");
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {
        return;
      });
      const {
        repositoryDBService,
        fileUpdateService,
        repositoryPathService,
        watcher,
        service,
      } = makeServiceDeps();

      repos.push(repo);
      repositoryDBService.getRepositoryByName.mockResolvedValue(repository);
      repositoryPathService.walkDirectory.mockResolvedValue([
        "src/a.ts",
        "src/b.ts",
      ]);
      watcher.start.mockResolvedValue(undefined);
      fileUpdateService.handleFileUpdate
        .mockImplementationOnce(() => {
          throw enqueueError;
        })
        .mockImplementationOnce(() => {
          return;
        });

      await expect(service.startTracking("Atlas")).resolves.toEqual(repository);

      expect(fileUpdateService.handleFileUpdate).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenCalledWith(
        "Failed to queue replay update for repo-32:src/a.ts",
        enqueueError,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // untrackRepository()
  // ---------------------------------------------------------------------------

  describe("untrackRepository()", () => {
    it("stops the watcher and removes the repository", async () => {
      const repository = makeRepository({ id: "repo-20" });
      const { repositoryDBService, fileUpdateService, watcher, service } =
        makeServiceDeps();

      repositoryDBService.getRepository.mockResolvedValue(repository);
      repositoryDBService.removeRepository.mockResolvedValue(true);

      await expect(
        service.untrackRepository("repo-20"),
      ).resolves.toBeUndefined();

      expect(watcher.stop).toHaveBeenCalledWith("repo-20");
      expect(repositoryDBService.removeRepository).toHaveBeenCalledWith(
        "repo-20",
      );
      expect(fileUpdateService.removeRepository).toHaveBeenCalledWith(
        "repo-20",
      );
    });

    it("throws RepositoryNotFoundError when the repository does not exist", async () => {
      const { repositoryDBService, watcher, service } = makeServiceDeps();

      repositoryDBService.getRepository.mockResolvedValue(null);

      await expect(service.untrackRepository("missing-repo")).rejects.toEqual(
        new RepositoryNotFoundError("missing-repo"),
      );
      expect(watcher.stop).not.toHaveBeenCalled();
      expect(repositoryDBService.removeRepository).not.toHaveBeenCalled();
    });
  });
});
