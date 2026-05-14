import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RepositoryIndexingError,
  RepositoryNotFoundError,
  RepositoryPathNotDirectoryError,
  RepositoryPathNotFoundError,
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
  const watcher = createMockWatcher();
  const service = new RepositoryOrchestratorService({
    repositoryDBService,
    repositoryInitializerService,
    fileUpdateService,
    watcher,
    ...config,
  });

  return {
    repositoryDBService,
    repositoryInitializerService,
    fileUpdateService,
    watcher,
    service,
  };
}

async function makeTempDirectory(
  prefix = "repository-service-",
): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function makeTempFile(): Promise<string> {
  const directoryPath = await makeTempDirectory("repository-service-file-");
  const filePath = path.join(directoryPath, "repo.txt");

  await fs.writeFile(filePath, "not a directory", "utf8");

  return filePath;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RepositoryOrchestratorService", () => {
  let tempPaths: string[];

  beforeEach(() => {
    tempPaths = [];
  });

  afterEach(async () => {
    await Promise.all(
      tempPaths.map(async (tempPath) => {
        await fs.rm(tempPath, { recursive: true, force: true });
      }),
    );

    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // trackRepository()
  // ---------------------------------------------------------------------------

  describe("trackRepository()", () => {
    it("creates a repository, starts the watcher, and indexes the repository", async () => {
      const tempDirectoryPath = await makeTempDirectory();
      const relativePath = path.relative(process.cwd(), tempDirectoryPath);
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
        watcher,
        service,
      } = makeServiceDeps();

      tempPaths.push(tempDirectoryPath);
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
      const tempDirectoryPath = await makeTempDirectory();
      const createdRepository = makeRepository({
        id: "repo-11",
        path: tempDirectoryPath,
      });
      const {
        repositoryDBService,
        repositoryInitializerService,
        fileUpdateService,
        watcher,
        service,
      } = makeServiceDeps();

      tempPaths.push(tempDirectoryPath);
      repositoryDBService.createRepository.mockResolvedValue(createdRepository);
      repositoryInitializerService.initializeRepository.mockResolvedValue(
        undefined,
      );
      watcher.start.mockResolvedValue(undefined);

      await service.trackRepository(makeRepositoryInput(tempDirectoryPath));

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
        tempDirectoryPath,
        "src/created.ts",
        "created",
      );
      expect(fileUpdateService.handleFileUpdate).toHaveBeenNthCalledWith(
        2,
        "repo-11",
        tempDirectoryPath,
        "src/updated.ts",
        "updated",
      );
      expect(fileUpdateService.handleFileUpdate).toHaveBeenNthCalledWith(
        3,
        "repo-11",
        tempDirectoryPath,
        "src/deleted.ts",
        "deleted",
      );
    });

    it("throws RepositoryPathNotFoundError when the path does not exist", async () => {
      const missingPath = path.join(os.tmpdir(), `missing-${Date.now()}`);
      const {
        repositoryDBService,
        repositoryInitializerService,
        watcher,
        service,
      } = makeServiceDeps();

      await expect(
        service.trackRepository(makeRepositoryInput(missingPath)),
      ).rejects.toEqual(
        new RepositoryPathNotFoundError(path.resolve(missingPath)),
      );
      expect(repositoryDBService.createRepository).not.toHaveBeenCalled();
      expect(watcher.start).not.toHaveBeenCalled();
      expect(
        repositoryInitializerService.initializeRepository,
      ).not.toHaveBeenCalled();
    });

    it("throws RepositoryPathNotDirectoryError when the path is a file", async () => {
      const filePath = await makeTempFile();
      const {
        repositoryDBService,
        repositoryInitializerService,
        watcher,
        service,
      } = makeServiceDeps();

      tempPaths.push(path.dirname(filePath));

      await expect(
        service.trackRepository(makeRepositoryInput(filePath)),
      ).rejects.toEqual(
        new RepositoryPathNotDirectoryError(path.resolve(filePath)),
      );
      expect(repositoryDBService.createRepository).not.toHaveBeenCalled();
      expect(watcher.start).not.toHaveBeenCalled();
      expect(
        repositoryInitializerService.initializeRepository,
      ).not.toHaveBeenCalled();
    });

    it("rolls back and wraps watcher start failures", async () => {
      const tempDirectoryPath = await makeTempDirectory();
      const createdRepository = makeRepository({
        id: "repo-13",
        path: tempDirectoryPath,
      });
      const watcherError = new Error("watcher failed");
      const {
        repositoryDBService,
        repositoryInitializerService,
        fileUpdateService,
        watcher,
        service,
      } = makeServiceDeps();

      tempPaths.push(tempDirectoryPath);
      repositoryDBService.createRepository.mockResolvedValue(createdRepository);
      repositoryDBService.removeRepository.mockResolvedValue(true);
      watcher.start.mockRejectedValue(watcherError);

      await expect(
        service.trackRepository(makeRepositoryInput(tempDirectoryPath)),
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
