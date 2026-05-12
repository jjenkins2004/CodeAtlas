import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileUpdateService } from "../../services/FileUpdateService.js";
import { createMockDebounceService } from "../fixtures/mockDebounceService.js";
import { createMockFileDBService } from "../fixtures/mockFileDBService.js";
import { createMockHasherService } from "../fixtures/mockHasher.js";
import { createMockRepositoryPathService } from "../fixtures/mockRepositoryPathService.js";
import { createMockRepositoryIndexerService } from "../fixtures/mockRepositoryIndexerService.js";
import {
  createMockFileUpdateTranslatorServiceType,
  type MockFileUpdateTranslatorServiceType,
} from "../fixtures/mockFileUpdateTranslatorService.js";

type ServiceDeps = {
  debounceService: ReturnType<typeof createMockDebounceService>;
  fileDBService: ReturnType<typeof createMockFileDBService>;
  hasherService: ReturnType<typeof createMockHasherService>;
  repositoryPathService: ReturnType<typeof createMockRepositoryPathService>;
  indexService: ReturnType<typeof createMockRepositoryIndexerService>;
  fileUpdateTranslatorServiceType: MockFileUpdateTranslatorServiceType & {
    instances: InstanceType<MockFileUpdateTranslatorServiceType>[];
  };
  service: FileUpdateService;
};

function makeServiceDeps(): ServiceDeps {
  const debounceService = createMockDebounceService();
  const fileDBService = createMockFileDBService();
  const hasherService = createMockHasherService();
  const repositoryPathService = createMockRepositoryPathService();
  const indexService = createMockRepositoryIndexerService();
  const fileUpdateTranslatorServiceType =
    createMockFileUpdateTranslatorServiceType();
  const service = new FileUpdateService({
    debounceService,
    fileDBService,
    hasherService,
    repositoryPathService,
    indexService,
    fileUpdateTranslatorServiceType,
  });

  return {
    debounceService,
    fileDBService,
    hasherService,
    repositoryPathService,
    indexService,
    fileUpdateTranslatorServiceType,
    service,
  };
}

async function makeTempDirectory(
  prefix = "file-update-service-",
): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("FileUpdateService", () => {
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

  it("creates a file after debounce and notifies the symbol guard", async () => {
    const tempDirectoryPath = await makeTempDirectory();
    const repositoryRelativePath = "src/example.ts";
    const fullPath = path.join(tempDirectoryPath, repositoryRelativePath);
    const {
      debounceService,
      fileDBService,
      hasherService,
      repositoryPathService,
      indexService,
      fileUpdateTranslatorServiceType,
      service,
    } = makeServiceDeps();

    tempPaths.push(tempDirectoryPath);
    hasherService.hashFile.mockResolvedValueOnce("file-hash-created");
    fileDBService.createFile.mockResolvedValue({
      id: "file-created",
      repositoryId: "repo-1",
      path: repositoryRelativePath,
      hash: "file-hash-created",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    });

    service.handleFileUpdate(
      "repo-1",
      tempDirectoryPath,
      repositoryRelativePath,
      "created",
    );

    const callback = debounceService.debounce.mock.calls[0]?.[3] as
      | (() => Promise<void>)
      | undefined;

    await callback?.();

    expect(debounceService.debounce).toHaveBeenCalledWith(
      `repo-1:${repositoryRelativePath}`,
      repositoryRelativePath,
      5000,
      expect.any(Function),
    );
    expect(repositoryPathService.toRepositoryFullPath).toHaveBeenCalledWith(
      tempDirectoryPath,
      repositoryRelativePath,
    );
    expect(hasherService.hashFile).toHaveBeenCalledWith(fullPath);
    expect(fileDBService.createFile).toHaveBeenCalledWith({
      repositoryId: "repo-1",
      path: repositoryRelativePath,
      hash: "file-hash-created",
    });
    expect(fileUpdateTranslatorServiceType.instances).toHaveLength(1);
    expect(fileUpdateTranslatorServiceType.instances[0]?.repositoryId).toBe(
      "repo-1",
    );
    expect(
      fileUpdateTranslatorServiceType.instances[0]
        ?.registerOnSymbolShouldBeReindexed,
    ).toHaveBeenCalledWith(expect.any(Function));
    expect(
      fileUpdateTranslatorServiceType.instances[0]
        ?.registerOnSymbolShouldBeDeleted,
    ).toHaveBeenCalledWith(expect.any(Function));
    expect(
      fileUpdateTranslatorServiceType.instances[0]?.fileWasUpdated,
    ).toHaveBeenCalledWith(repositoryRelativePath);

    const callbackForSymbolReindex = fileUpdateTranslatorServiceType
      .instances[0]?.registerOnSymbolShouldBeReindexed.mock.calls[0]?.[0] as
      | ((symbol: { id: string }) => void)
      | undefined;

    callbackForSymbolReindex?.({ id: "symbol-1" } as never);
    expect(indexService.indexSymbol).toHaveBeenCalledWith({ id: "symbol-1" });
  });

  it("updates a tracked file after debounce", async () => {
    const tempDirectoryPath = await makeTempDirectory();
    const repositoryRelativePath = "src/example.ts";
    const fullPath = path.join(tempDirectoryPath, repositoryRelativePath);
    const existingFile = {
      id: "file-existing",
      repositoryId: "repo-1",
      path: repositoryRelativePath,
      hash: "file-hash-existing",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    };
    const {
      debounceService,
      fileDBService,
      hasherService,
      repositoryPathService,
      service,
    } = makeServiceDeps();

    tempPaths.push(tempDirectoryPath);
    fileDBService.getFileByRepositoryAndPath.mockResolvedValue(existingFile);
    fileDBService.updateFile.mockResolvedValue({
      ...existingFile,
      hash: "file-hash-updated",
    });
    hasherService.hashFile.mockResolvedValueOnce("file-hash-updated");

    service.handleFileUpdate(
      "repo-1",
      tempDirectoryPath,
      repositoryRelativePath,
      "updated",
    );

    const callback = debounceService.debounce.mock.calls[0]?.[3] as
      | (() => Promise<void>)
      | undefined;

    await callback?.();

    expect(repositoryPathService.toRepositoryFullPath).toHaveBeenCalledWith(
      tempDirectoryPath,
      repositoryRelativePath,
    );
    expect(fileDBService.getFileByRepositoryAndPath).toHaveBeenCalledWith(
      "repo-1",
      repositoryRelativePath,
    );
    expect(hasherService.hashFile).toHaveBeenCalledWith(fullPath);
    expect(fileDBService.updateFile).toHaveBeenCalledWith(existingFile.id, {
      path: repositoryRelativePath,
      hash: "file-hash-updated",
    });
  });

  it("deletes a tracked file after debounce", async () => {
    const tempDirectoryPath = await makeTempDirectory();
    const repositoryRelativePath = "src/example.ts";
    const fullPath = path.join(tempDirectoryPath, repositoryRelativePath);
    const existingFile = {
      id: "file-existing",
      repositoryId: "repo-1",
      path: repositoryRelativePath,
      hash: "file-hash-existing",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    };
    const { debounceService, fileDBService, repositoryPathService, service } =
      makeServiceDeps();

    tempPaths.push(tempDirectoryPath);
    fileDBService.getFileByRepositoryAndPath.mockResolvedValue(existingFile);
    fileDBService.removeFile.mockResolvedValue(true);

    service.handleFileUpdate(
      "repo-1",
      tempDirectoryPath,
      repositoryRelativePath,
      "deleted",
    );

    const callback = debounceService.debounce.mock.calls[0]?.[3] as
      | (() => Promise<void>)
      | undefined;

    await callback?.();

    expect(repositoryPathService.toRepositoryFullPath).toHaveBeenCalledWith(
      tempDirectoryPath,
      repositoryRelativePath,
    );
    expect(fileDBService.getFileByRepositoryAndPath).toHaveBeenCalledWith(
      "repo-1",
      repositoryRelativePath,
    );
    expect(fileDBService.removeFile).toHaveBeenCalledWith(existingFile.id);
  });

  it("clears cached symbol guards when a repository is removed", async () => {
    const tempDirectoryPath = await makeTempDirectory();
    const repositoryRelativePath = "src/example.ts";
    const fullPath = path.join(tempDirectoryPath, repositoryRelativePath);
    const {
      debounceService,
      fileDBService,
      hasherService,
      repositoryPathService,
      fileUpdateTranslatorServiceType,
      service,
    } = makeServiceDeps();

    tempPaths.push(tempDirectoryPath);
    hasherService.hashFile.mockResolvedValueOnce("file-hash-created");
    fileDBService.createFile.mockResolvedValue({
      id: "file-created",
      repositoryId: "repo-1",
      path: repositoryRelativePath,
      hash: "file-hash-created",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    });

    service.handleFileUpdate(
      "repo-1",
      tempDirectoryPath,
      repositoryRelativePath,
      "created",
    );

    const firstCallback = debounceService.debounce.mock.calls[0]?.[3] as
      | (() => Promise<void>)
      | undefined;

    await firstCallback?.();
    expect(fileUpdateTranslatorServiceType.instances).toHaveLength(1);
    expect(repositoryPathService.toRepositoryFullPath).toHaveBeenCalledWith(
      tempDirectoryPath,
      repositoryRelativePath,
    );

    service.removeRepository("repo-1");

    service.handleFileUpdate(
      "repo-1",
      tempDirectoryPath,
      repositoryRelativePath,
      "created",
    );

    const secondCallback = debounceService.debounce.mock.calls[1]?.[3] as
      | (() => Promise<void>)
      | undefined;

    await secondCallback?.();

    expect(fileUpdateTranslatorServiceType.instances).toHaveLength(2);
  });
});
