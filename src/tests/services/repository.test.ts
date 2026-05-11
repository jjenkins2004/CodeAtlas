import { describe, expect, it, afterEach, vi } from "vitest";
import {
  RepositoryNotFoundError,
  type CreateRepositoryInput,
} from "../../models/Repository.js";
import type { Symbol as IndexedSymbol } from "../../models/Symbol.js";
import {
  RepositoryOrchestratorService,
  type RepositoryOrchestratorServiceConfig,
} from "../../services/Repository.js";
import { Watcher } from "../../services/Watcher.js";
import { createMockRepoDBService } from "../fixtures/mockRepoDBService.js";
import { createMockRepositoryIndexerService } from "../fixtures/mockRepositoryIndexerService.js";
import { createMockSymbolUpdateGuardServiceType } from "../fixtures/mockSymbolUpdateGuardService.js";

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

function makeSymbol(): IndexedSymbol {
  return {
    id: "symbol-1",
    repositoryId: "repo-0",
    symbol: "Example.run",
    file: "src/example.ts",
    type: "function",
    visibility: "public",
    blurb: null,
    implementation: null,
    tags: [],
    embedding: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("RepositoryOrchestratorService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("trackRepository()", () => {
    it("registers the symbol callback and starts the watcher", async () => {
      const repositoryDBService = createMockRepoDBService();
      const repositoryIndexerService = createMockRepositoryIndexerService();
      const symbolUpdateGuardServiceType =
        createMockSymbolUpdateGuardServiceType();
      const watcher = makeWatcherMock();
      const service = makeRepositoryService({
        repositoryDBService,
        indexService: repositoryIndexerService,
        symbolUpdateGuardServiceType,
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
      repositoryIndexerService.indexSymbol.mockResolvedValue(undefined);
      watcher.start.mockResolvedValue(undefined);

      const created = await service.trackRepository(makeRepositoryInput());

      expect(created).toEqual(createdRepository);
      expect(symbolUpdateGuardServiceType.instances).toHaveLength(1);
      expect(symbolUpdateGuardServiceType.instances[0]?.repositoryId).toBe(
        "repo-0",
      );
      expect(
        symbolUpdateGuardServiceType.instances[0]
          ?.registerOnSymbolShouldBeReindexed,
      ).toHaveBeenCalledWith(expect.any(Function));
      expect(watcher.start).toHaveBeenCalledWith(
        expect.objectContaining({ repositoryId: "repo-0" }),
      );
      expect(repositoryIndexerService.indexSymbol).not.toHaveBeenCalled();

      const registeredCallback = symbolUpdateGuardServiceType.instances[0]
        ?.registerOnSymbolShouldBeReindexed.mock.calls[0]?.[0] as
        | ((symbol: IndexedSymbol) => void)
        | undefined;

      registeredCallback?.(makeSymbol());

      expect(repositoryIndexerService.indexSymbol).toHaveBeenCalledWith(
        makeSymbol(),
      );
    });
  });

  describe("untrackRepository()", () => {
    it("stops the watcher and removes an existing repository", async () => {
      const repositoryDBService = createMockRepoDBService();
      const repositoryIndexerService = createMockRepositoryIndexerService();
      const symbolUpdateGuardServiceType =
        createMockSymbolUpdateGuardServiceType();
      const watcher = makeWatcherMock();
      const service = makeRepositoryService({
        repositoryDBService,
        indexService: repositoryIndexerService,
        symbolUpdateGuardServiceType,
        watcher: watcher as unknown as Watcher,
      });

      repositoryDBService.getRepository.mockResolvedValue({
        id: "repo-3",
        name: "CodeAtlas",
        path: process.cwd(),
        createdAt: new Date(),
      });
      repositoryDBService.removeRepository.mockResolvedValue(true);
      symbolUpdateGuardServiceType.instances[0]?.registerOnSymbolShouldBeReindexed.mockImplementation(
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
      const symbolUpdateGuardServiceType =
        createMockSymbolUpdateGuardServiceType();
      const watcher = makeWatcherMock();
      const service = makeRepositoryService({
        repositoryDBService,
        indexService: repositoryIndexerService,
        symbolUpdateGuardServiceType,
        watcher: watcher as unknown as Watcher,
      });

      repositoryDBService.getRepository.mockResolvedValue(null);
      symbolUpdateGuardServiceType.instances[0]?.registerOnSymbolShouldBeReindexed.mockImplementation(
        () => undefined,
      );

      await expect(service.untrackRepository("missing")).rejects.toBeInstanceOf(
        RepositoryNotFoundError,
      );
      expect(watcher.stop).not.toHaveBeenCalled();
    });
  });

  describe("watcher wiring", () => {
    it("forwards update events to the symbol guard service", async () => {
      const repositoryDBService = createMockRepoDBService();
      const repositoryIndexerService = createMockRepositoryIndexerService();
      const symbolUpdateGuardServiceType =
        createMockSymbolUpdateGuardServiceType();
      const watcher = makeWatcherMock();
      const service = makeRepositoryService({
        repositoryDBService,
        indexService: repositoryIndexerService,
        symbolUpdateGuardServiceType,
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
      symbolUpdateGuardServiceType.instances[0]?.registerOnSymbolShouldBeReindexed.mockImplementation(
        () => undefined,
      );
      watcher.start.mockResolvedValue(undefined);

      await service.trackRepository(makeRepositoryInput());

      const watcherConfig = watcher.start.mock.calls[0]?.[0];

      watcherConfig.onUpdate("/tmp/example.ts");

      expect(
        symbolUpdateGuardServiceType.instances[0]?.fileWasUpdated,
      ).toHaveBeenCalledWith("/tmp/example.ts");
    });
  });
});
