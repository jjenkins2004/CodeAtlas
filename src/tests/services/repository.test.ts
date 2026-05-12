import fs from "fs/promises";
import os from "os";
import path from "path";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  RepositoryIndexingError,
  RepositoryNotFoundError,
  RepositoryPathNotDirectoryError,
  RepositoryPathNotFoundError,
  type CreateRepositoryInput,
  type Repository,
} from "../../models/Repository.js";
import type { Symbol } from "../../models/Symbol.js";
import { IgnoreFilter } from "../../services/IgnoreFilter.js";
import {
  RepositoryOrchestratorService,
  type RepositoryOrchestratorServiceConfig,
} from "../../services/Repository.js";
import { createMockRepoDBService } from "../fixtures/mockRepoDBService.js";
import { createMockRepositoryIndexerService } from "../fixtures/mockRepositoryIndexerService.js";
import {
  createMockSymbolUpdateGuardServiceType,
  type MockSymbolUpdateGuardServiceType,
} from "../fixtures/mockSymbolUpdateGuardService.js";
import { createMockWatcher } from "../fixtures/mockWatcher.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type WatcherMock = ReturnType<typeof createMockWatcher>;

type ServiceDeps = {
  repositoryDBService: ReturnType<typeof createMockRepoDBService>;
  repositoryIndexerService: ReturnType<
    typeof createMockRepositoryIndexerService
  >;
  symbolUpdateGuardServiceType: MockSymbolUpdateGuardServiceType & {
    instances: InstanceType<MockSymbolUpdateGuardServiceType>[];
  };
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

function makeSymbol(overrides: Partial<Symbol> = {}): Symbol {
  return {
    id: "symbol-1",
    repositoryId: "repo-1",
    symbol: "Example.run",
    fileId: "file-1",
    hash: "symbol-hash-1",
    type: "function",
    visibility: "public",
    blurb: null,
    implementation: null,
    tags: [],
    embedding: null,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeServiceDeps(
  config: Partial<RepositoryOrchestratorServiceConfig> = {},
): ServiceDeps {
  const repositoryDBService = createMockRepoDBService();
  const repositoryIndexerService = createMockRepositoryIndexerService();
  const symbolUpdateGuardServiceType = createMockSymbolUpdateGuardServiceType();
  const watcher = createMockWatcher();
  const service = new RepositoryOrchestratorService({
    repositoryDBService,
    indexService: repositoryIndexerService,
    symbolUpdateGuardServiceType,
    watcher,
    ...config,
  });

  return {
    repositoryDBService,
    repositoryIndexerService,
    symbolUpdateGuardServiceType,
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
        repositoryIndexerService,
        symbolUpdateGuardServiceType,
        watcher,
        service,
      } = makeServiceDeps();

      tempPaths.push(tempDirectoryPath);
      repositoryDBService.createRepository.mockResolvedValue(createdRepository);
      repositoryIndexerService.indexRepository.mockResolvedValue(undefined);
      repositoryIndexerService.indexSymbol.mockResolvedValue(undefined);
      watcher.start.mockResolvedValue(undefined);

      const trackedRepository = await service.trackRepository(
        makeRepositoryInput(relativePath),
      );

      expect(trackedRepository).toEqual(createdRepository);
      expect(repositoryDBService.createRepository).toHaveBeenCalledWith({
        name: "CodeAtlas",
        path: normalizedPath,
      });
      expect(symbolUpdateGuardServiceType.instances).toHaveLength(1);
      expect(symbolUpdateGuardServiceType.instances[0]?.repositoryId).toBe(
        "repo-10",
      );
      expect(
        symbolUpdateGuardServiceType.instances[0]
          ?.registerOnSymbolShouldBeReindexed,
      ).toHaveBeenCalledWith(expect.any(Function));
      expect(ignoreFilterSpy).toHaveBeenCalledWith(normalizedPath);
      expect(watcher.start).toHaveBeenCalledWith({
        repositoryId: "repo-10",
        rootPath: normalizedPath,
        ignoreFilter,
        onCreation: expect.any(Function),
        onUpdate: expect.any(Function),
        onDeletion: expect.any(Function),
      });
      expect(repositoryIndexerService.indexRepository).toHaveBeenCalledWith(
        "repo-10",
      );
      expect(repositoryDBService.removeRepository).not.toHaveBeenCalled();
    });

    it("forwards watcher events to the symbol guard service", async () => {
      const tempDirectoryPath = await makeTempDirectory();
      const createdRepository = makeRepository({
        id: "repo-11",
        path: tempDirectoryPath,
      });
      const {
        repositoryDBService,
        repositoryIndexerService,
        symbolUpdateGuardServiceType,
        watcher,
        service,
      } = makeServiceDeps();

      tempPaths.push(tempDirectoryPath);
      repositoryDBService.createRepository.mockResolvedValue(createdRepository);
      repositoryIndexerService.indexRepository.mockResolvedValue(undefined);
      watcher.start.mockResolvedValue(undefined);

      await service.trackRepository(makeRepositoryInput(tempDirectoryPath));

      const watcherConfig = watcher.start.mock.calls[0]?.[0] as {
        onCreation: (filePath: string) => void;
        onUpdate: (filePath: string) => void;
        onDeletion: (filePath: string) => void;
      };

      watcherConfig.onCreation("/tmp/created.ts");
      watcherConfig.onUpdate("/tmp/updated.ts");
      watcherConfig.onDeletion("/tmp/deleted.ts");

      expect(
        symbolUpdateGuardServiceType.instances[0]?.fileWasCreated,
      ).toHaveBeenCalledWith("/tmp/created.ts");
      expect(
        symbolUpdateGuardServiceType.instances[0]?.fileWasUpdated,
      ).toHaveBeenCalledWith("/tmp/updated.ts");
      expect(
        symbolUpdateGuardServiceType.instances[0]?.fileWasDeleted,
      ).toHaveBeenCalledWith("/tmp/deleted.ts");
    });

    it("forwards symbol reindex callbacks to the indexer service", async () => {
      const tempDirectoryPath = await makeTempDirectory();
      const createdRepository = makeRepository({
        id: "repo-12",
        path: tempDirectoryPath,
      });
      const symbol = makeSymbol({ repositoryId: "repo-12" });
      const {
        repositoryDBService,
        repositoryIndexerService,
        symbolUpdateGuardServiceType,
        watcher,
        service,
      } = makeServiceDeps();

      tempPaths.push(tempDirectoryPath);
      repositoryDBService.createRepository.mockResolvedValue(createdRepository);
      repositoryIndexerService.indexRepository.mockResolvedValue(undefined);
      repositoryIndexerService.indexSymbol.mockResolvedValue(undefined);
      watcher.start.mockResolvedValue(undefined);

      await service.trackRepository(makeRepositoryInput(tempDirectoryPath));

      const callback = symbolUpdateGuardServiceType.instances[0]
        ?.registerOnSymbolShouldBeReindexed.mock.calls[0]?.[0] as
        | ((nextSymbol: Symbol) => void)
        | undefined;

      callback?.(symbol);

      expect(repositoryIndexerService.indexSymbol).toHaveBeenCalledWith(symbol);
    });

    it("throws RepositoryPathNotFoundError when the path does not exist", async () => {
      const missingPath = path.join(os.tmpdir(), `missing-${Date.now()}`);
      const {
        repositoryDBService,
        repositoryIndexerService,
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
      expect(repositoryIndexerService.indexRepository).not.toHaveBeenCalled();
    });

    it("throws RepositoryPathNotDirectoryError when the path is a file", async () => {
      const filePath = await makeTempFile();
      const {
        repositoryDBService,
        repositoryIndexerService,
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
      expect(repositoryIndexerService.indexRepository).not.toHaveBeenCalled();
    });

    it("propagates unexpected stat errors without calling collaborators", async () => {
      const expectedError = new Error("stat failed");
      const statSpy = vi.spyOn(fs, "stat").mockRejectedValue(expectedError);
      const {
        repositoryDBService,
        repositoryIndexerService,
        watcher,
        service,
      } = makeServiceDeps();

      await expect(
        service.trackRepository(makeRepositoryInput("/tmp/repo")),
      ).rejects.toBe(expectedError);
      expect(statSpy).toHaveBeenCalled();
      expect(repositoryDBService.createRepository).not.toHaveBeenCalled();
      expect(watcher.start).not.toHaveBeenCalled();
      expect(repositoryIndexerService.indexRepository).not.toHaveBeenCalled();
    });

    it("propagates createRepository failures without attempting rollback", async () => {
      const tempDirectoryPath = await makeTempDirectory();
      const expectedError = new Error("insert failed");
      const {
        repositoryDBService,
        repositoryIndexerService,
        watcher,
        service,
      } = makeServiceDeps();

      tempPaths.push(tempDirectoryPath);
      repositoryDBService.createRepository.mockRejectedValue(expectedError);

      await expect(
        service.trackRepository(makeRepositoryInput(tempDirectoryPath)),
      ).rejects.toBe(expectedError);
      expect(watcher.start).not.toHaveBeenCalled();
      expect(repositoryDBService.removeRepository).not.toHaveBeenCalled();
      expect(repositoryIndexerService.indexRepository).not.toHaveBeenCalled();
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
        repositoryIndexerService,
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
      expect(repositoryDBService.removeRepository).toHaveBeenCalledWith(
        "repo-13",
      );
      expect(repositoryIndexerService.indexRepository).not.toHaveBeenCalled();
    });

    it("rolls back and wraps indexRepository failures", async () => {
      const tempDirectoryPath = await makeTempDirectory();
      const createdRepository = makeRepository({
        id: "repo-14",
        path: tempDirectoryPath,
      });
      const indexingError = new Error("index failed");
      const {
        repositoryDBService,
        repositoryIndexerService,
        watcher,
        service,
      } = makeServiceDeps();

      tempPaths.push(tempDirectoryPath);
      repositoryDBService.createRepository.mockResolvedValue(createdRepository);
      repositoryDBService.removeRepository.mockResolvedValue(true);
      repositoryIndexerService.indexRepository.mockRejectedValue(indexingError);
      watcher.start.mockResolvedValue(undefined);

      await expect(
        service.trackRepository(makeRepositoryInput(tempDirectoryPath)),
      ).rejects.toMatchObject({
        name: "RepositoryIndexingError",
        repositoryId: "repo-14",
        message: `Failed to index repository repo-14 during repository reindex: ${indexingError.message}`,
      });
      expect(watcher.stop).toHaveBeenCalledWith("repo-14");
      expect(repositoryDBService.removeRepository).toHaveBeenCalledWith(
        "repo-14",
      );
    });

    it("rethrows existing RepositoryIndexingError values after rollback", async () => {
      const tempDirectoryPath = await makeTempDirectory();
      const createdRepository = makeRepository({
        id: "repo-15",
        path: tempDirectoryPath,
      });
      const existingError = new RepositoryIndexingError(
        "repo-15",
        new Error("index failed"),
      );
      const {
        repositoryDBService,
        repositoryIndexerService,
        watcher,
        service,
      } = makeServiceDeps();

      tempPaths.push(tempDirectoryPath);
      repositoryDBService.createRepository.mockResolvedValue(createdRepository);
      repositoryDBService.removeRepository.mockResolvedValue(true);
      repositoryIndexerService.indexRepository.mockRejectedValue(existingError);
      watcher.start.mockResolvedValue(undefined);

      await expect(
        service.trackRepository(makeRepositoryInput(tempDirectoryPath)),
      ).rejects.toBe(existingError);
      expect(watcher.stop).toHaveBeenCalledWith("repo-15");
      expect(repositoryDBService.removeRepository).toHaveBeenCalledWith(
        "repo-15",
      );
    });

    it("continues rollback when watcher stop fails during track cleanup", async () => {
      const tempDirectoryPath = await makeTempDirectory();
      const createdRepository = makeRepository({
        id: "repo-16",
        path: tempDirectoryPath,
      });
      const indexingError = new Error("index failed");
      const warningSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      const {
        repositoryDBService,
        repositoryIndexerService,
        watcher,
        service,
      } = makeServiceDeps();

      tempPaths.push(tempDirectoryPath);
      repositoryDBService.createRepository.mockResolvedValue(createdRepository);
      repositoryDBService.removeRepository.mockResolvedValue(true);
      repositoryIndexerService.indexRepository.mockRejectedValue(indexingError);
      watcher.start.mockResolvedValue(undefined);
      watcher.stop.mockRejectedValue(new Error("stop failed"));

      await expect(
        service.trackRepository(makeRepositoryInput(tempDirectoryPath)),
      ).rejects.toMatchObject({
        name: "RepositoryIndexingError",
        repositoryId: "repo-16",
      });
      expect(repositoryDBService.removeRepository).toHaveBeenCalledWith(
        "repo-16",
      );
      expect(warningSpy).toHaveBeenCalledWith(
        "Failed to stop watcher for repo-16:",
        expect.any(Error),
      );
    });

    it("warns when rollback cannot remove the created repository", async () => {
      const tempDirectoryPath = await makeTempDirectory();
      const createdRepository = makeRepository({
        id: "repo-17",
        path: tempDirectoryPath,
      });
      const watcherError = new Error("watcher failed");
      const warningSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      const { repositoryDBService, watcher, service } = makeServiceDeps();

      tempPaths.push(tempDirectoryPath);
      repositoryDBService.createRepository.mockResolvedValue(createdRepository);
      repositoryDBService.removeRepository.mockResolvedValue(false);
      watcher.start.mockRejectedValue(watcherError);

      await expect(
        service.trackRepository(makeRepositoryInput(tempDirectoryPath)),
      ).rejects.toMatchObject({
        name: "RepositoryIndexingError",
        repositoryId: "repo-17",
      });
      expect(warningSpy).toHaveBeenCalledWith(
        "Failed to remove repository repo-17 during rollback",
      );
    });

    it("warns when rollback removal throws after a track failure", async () => {
      const tempDirectoryPath = await makeTempDirectory();
      const createdRepository = makeRepository({
        id: "repo-18",
        path: tempDirectoryPath,
      });
      const watcherError = new Error("watcher failed");
      const removalError = new Error("remove failed");
      const warningSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      const { repositoryDBService, watcher, service } = makeServiceDeps();

      tempPaths.push(tempDirectoryPath);
      repositoryDBService.createRepository.mockResolvedValue(createdRepository);
      repositoryDBService.removeRepository.mockRejectedValue(removalError);
      watcher.start.mockRejectedValue(watcherError);

      await expect(
        service.trackRepository(makeRepositoryInput(tempDirectoryPath)),
      ).rejects.toMatchObject({
        name: "RepositoryIndexingError",
        repositoryId: "repo-18",
      });
      expect(warningSpy).toHaveBeenCalledWith(
        "Failed to remove repository repo-18 during rollback:",
        removalError,
      );
    });

    it("creates a fresh symbol guard after a rollback clears cached state", async () => {
      const tempDirectoryPath = await makeTempDirectory();
      const createdRepository = makeRepository({
        id: "repo-19",
        path: tempDirectoryPath,
      });
      const {
        repositoryDBService,
        repositoryIndexerService,
        symbolUpdateGuardServiceType,
        watcher,
        service,
      } = makeServiceDeps();

      tempPaths.push(tempDirectoryPath);
      repositoryDBService.createRepository.mockResolvedValue(createdRepository);
      repositoryDBService.removeRepository.mockResolvedValue(true);
      watcher.start.mockRejectedValueOnce(new Error("watcher failed"));
      watcher.start.mockResolvedValueOnce(undefined);
      repositoryIndexerService.indexRepository.mockResolvedValue(undefined);

      await expect(
        service.trackRepository(makeRepositoryInput(tempDirectoryPath)),
      ).rejects.toBeInstanceOf(RepositoryIndexingError);

      await service.trackRepository(makeRepositoryInput(tempDirectoryPath));

      expect(symbolUpdateGuardServiceType.instances).toHaveLength(2);
      expect(symbolUpdateGuardServiceType.instances[0]).not.toBe(
        symbolUpdateGuardServiceType.instances[1],
      );
    });
  });

  // ---------------------------------------------------------------------------
  // untrackRepository()
  // ---------------------------------------------------------------------------

  describe("untrackRepository()", () => {
    it("stops the watcher and removes an existing repository", async () => {
      const repository = makeRepository({ id: "repo-20" });
      const { repositoryDBService, watcher, service } = makeServiceDeps();

      repositoryDBService.getRepository.mockResolvedValue(repository);
      repositoryDBService.removeRepository.mockResolvedValue(true);
      watcher.stop.mockResolvedValue(undefined);

      await service.untrackRepository("repo-20");

      expect(watcher.stop).toHaveBeenCalledWith("repo-20");
      expect(repositoryDBService.removeRepository).toHaveBeenCalledWith(
        "repo-20",
      );
      expect(watcher.stop.mock.invocationCallOrder[0]).toBeLessThan(
        repositoryDBService.removeRepository.mock.invocationCallOrder[0] ?? 0,
      );
    });

    it("throws RepositoryNotFoundError when the repository does not exist", async () => {
      const { repositoryDBService, watcher, service } = makeServiceDeps();

      repositoryDBService.getRepository.mockResolvedValue(null);

      await expect(service.untrackRepository("missing")).rejects.toEqual(
        new RepositoryNotFoundError("missing"),
      );
      expect(watcher.stop).not.toHaveBeenCalled();
      expect(repositoryDBService.removeRepository).not.toHaveBeenCalled();
    });

    it("warns and continues when watcher stop fails during untrack", async () => {
      const repository = makeRepository({ id: "repo-21" });
      const warningSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      const { repositoryDBService, watcher, service } = makeServiceDeps();

      repositoryDBService.getRepository.mockResolvedValue(repository);
      repositoryDBService.removeRepository.mockResolvedValue(true);
      watcher.stop.mockRejectedValue(new Error("stop failed"));

      await expect(
        service.untrackRepository("repo-21"),
      ).resolves.toBeUndefined();
      expect(repositoryDBService.removeRepository).toHaveBeenCalledWith(
        "repo-21",
      );
      expect(warningSpy).toHaveBeenCalledWith(
        "Failed to stop watcher for repo-21:",
        expect.any(Error),
      );
    });

    it("throws RepositoryNotFoundError when removal reports no repository", async () => {
      const repository = makeRepository({ id: "repo-22" });
      const { repositoryDBService, watcher, service } = makeServiceDeps();

      repositoryDBService.getRepository.mockResolvedValue(repository);
      repositoryDBService.removeRepository.mockResolvedValue(false);
      watcher.stop.mockResolvedValue(undefined);

      await expect(service.untrackRepository("repo-22")).rejects.toEqual(
        new RepositoryNotFoundError("repo-22"),
      );
    });

    it("propagates getRepository failures without attempting cleanup", async () => {
      const expectedError = new Error("lookup failed");
      const { repositoryDBService, watcher, service } = makeServiceDeps();

      repositoryDBService.getRepository.mockRejectedValue(expectedError);

      await expect(service.untrackRepository("repo-23")).rejects.toBe(
        expectedError,
      );
      expect(watcher.stop).not.toHaveBeenCalled();
      expect(repositoryDBService.removeRepository).not.toHaveBeenCalled();
    });

    it("creates a fresh symbol guard after untrack clears cached state", async () => {
      const tempDirectoryPath = await makeTempDirectory();
      const createdRepository = makeRepository({
        id: "repo-24",
        path: tempDirectoryPath,
      });
      const {
        repositoryDBService,
        repositoryIndexerService,
        symbolUpdateGuardServiceType,
        watcher,
        service,
      } = makeServiceDeps();

      tempPaths.push(tempDirectoryPath);
      repositoryDBService.createRepository.mockResolvedValue(createdRepository);
      repositoryDBService.getRepository.mockResolvedValue(createdRepository);
      repositoryDBService.removeRepository.mockResolvedValue(true);
      repositoryIndexerService.indexRepository.mockResolvedValue(undefined);
      watcher.start.mockResolvedValue(undefined);
      watcher.stop.mockResolvedValue(undefined);

      await service.trackRepository(makeRepositoryInput(tempDirectoryPath));
      await service.untrackRepository("repo-24");
      await service.trackRepository(makeRepositoryInput(tempDirectoryPath));

      expect(symbolUpdateGuardServiceType.instances).toHaveLength(2);
      expect(symbolUpdateGuardServiceType.instances[0]).not.toBe(
        symbolUpdateGuardServiceType.instances[1],
      );
    });
  });
});
