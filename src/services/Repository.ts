import fs from "fs/promises";
import path from "path";
import {
    RepositoryPathNotFoundError,
    RepositoryPathNotDirectoryError,
    RepositoryIndexingError,
    RepositoryNotFoundError,
    ReindexResult,
   CreateRepositoryInput,
   Repository,
} from "../models/Repository.js";
import {
  DuplicateRepositoryError,
  repositoryDBService,
} from "../db/services/repository.js";
import { symbolDBService } from "../db/services/symbol.js";
import { IgnoreFilter } from "./IgnoreFilter.js";
import { Watcher } from "./Watcher.js";


export class RepositoryOrchestratorService {
  private readonly watcher: Watcher;

  constructor(watcher: Watcher = new Watcher()) {
    this.watcher = watcher;
  }

  async trackRepository(input: CreateRepositoryInput): Promise<Repository> {
    const repositoryPath = await this.validateAndNormalizeRepositoryPath(
      input.path,
    );

    const repositoryInput: CreateRepositoryInput = {
      name: input.name,
      path: repositoryPath,
    };

    let createdRepository: Repository | null = null;

    try {
      createdRepository =
        await repositoryDBService.createRepository(repositoryInput);
      await this.reindex(createdRepository.id);
      await this.startWatcher(createdRepository);
      return createdRepository;
    } catch (error) {
      if (createdRepository) {
        await this.safeCleanupFailedTrack(createdRepository.id);
      }

      if (error instanceof DuplicateRepositoryError) {
        throw error;
      }

      if (
        error instanceof RepositoryPathNotFoundError ||
        error instanceof RepositoryPathNotDirectoryError ||
        error instanceof RepositoryIndexingError
      ) {
        throw error;
      }

      throw new RepositoryIndexingError(
        createdRepository?.id ?? "unknown",
        error,
      );
    }
  }

  async untrackRepository(repositoryId: string): Promise<void> {
    const repository = await repositoryDBService.getRepository(repositoryId);

    if (!repository) {
      throw new RepositoryNotFoundError(repositoryId);
    }

    await this.safeStopWatcher(repositoryId);

    const removed = await repositoryDBService.removeRepository(repositoryId);

    if (!removed) {
      throw new RepositoryNotFoundError(repositoryId);
    }
  }

  async reindex(
    repositoryId: string,
    subpath?: string,
  ): Promise<ReindexResult> {
    const repository = await repositoryDBService.getRepository(repositoryId);

    if (!repository) {
      throw new RepositoryNotFoundError(repositoryId);
    }
    throw new RepositoryIndexingError(repositoryId, "Reindexing is currently disabled");
  }

  async listRepositories(): Promise<Repository[]> {
    return repositoryDBService.listRepositories();
  }

  async getRepository(repositoryId: string): Promise<Repository | null> {
    return repositoryDBService.getRepository(repositoryId);
  }

  private async startWatcher(repository: Repository): Promise<void> {
    await this.watcher.start({
      repositoryId: repository.id,
      rootPath: repository.path,
      ignoreFilter: IgnoreFilter.createFilter(repository.path),
      onCreation: (filePath) => {
      },
      onUpdate: (filePath) => {
      },
      onDeletion: (filePath) => {
        void this.removeSymbolsForDeletedFile(
          repository.id,
          repository.path,
          filePath,
        );
      },
    });
  }

  private async removeSymbolsForDeletedFile(
    repositoryId: string,
    rootPath: string,
    absoluteFilePath: string,
  ): Promise<void> {
    const relativeFilePath = this.toStoredRelativePath(
      rootPath,
      absoluteFilePath,
    );

    if (!relativeFilePath) {
      return;
    }

    try {
      await symbolDBService.removeSymbolsByRepositoryFile(
        repositoryId,
        relativeFilePath,
      );
    } catch (error) {
      console.error(
        `Failed to delete symbols for removed file ${relativeFilePath}:`,
        error,
      );
    }
  }

  private async validateAndNormalizeRepositoryPath(
    inputPath: string,
  ): Promise<string> {
    const normalizedPath = path.resolve(inputPath);

    let stats;

    try {
      stats = await fs.stat(normalizedPath);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        throw new RepositoryPathNotFoundError(normalizedPath);
      }

      throw error;
    }

    if (!stats.isDirectory()) {
      throw new RepositoryPathNotDirectoryError(normalizedPath);
    }

    return normalizedPath;
  }

  private resolveScopeRoot(repositoryPath: string, subpath?: string): string {
    if (!subpath) {
      return repositoryPath;
    }

    const resolvedScopeRoot = path.resolve(repositoryPath, subpath);
    const relative = path.relative(repositoryPath, resolvedScopeRoot);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Reindex subpath must stay inside the repository root");
    }

    return resolvedScopeRoot;
  }

  private toStoredRelativePath(
    repositoryPath: string,
    absoluteFilePath: string,
  ): string | null {
    const relativePath = path.relative(repositoryPath, absoluteFilePath);

    if (
      !relativePath ||
      relativePath === "." ||
      relativePath.startsWith("..") ||
      path.isAbsolute(relativePath)
    ) {
      return null;
    }

    return relativePath.split(path.sep).join("/");
  }

  private async safeCleanupFailedTrack(repositoryId: string): Promise<void> {
    await this.safeStopWatcher(repositoryId);

    try {
      await repositoryDBService.removeRepository(repositoryId);
    } catch (error) {
      console.warn(
        `Failed to rollback repository ${repositoryId} after track failure:`,
        error,
      );
    }
  }

  private async safeStopWatcher(repositoryId: string): Promise<void> {
    try {
      await this.watcher.stop(repositoryId);
    } catch (error) {
      console.warn(`Failed to stop watcher for ${repositoryId}:`, error);
    }
  }

  private async ensureDirectoryExists(directoryPath: string): Promise<void> {
    let stats;

    try {
      stats = await fs.stat(directoryPath);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        throw new RepositoryPathNotFoundError(directoryPath);
      }

      throw error;
    }

    if (!stats.isDirectory()) {
      throw new RepositoryPathNotDirectoryError(directoryPath);
    }
  }
}

export const repositoryService = new RepositoryOrchestratorService();

export const RepositoryService = {
  trackRepository: (input: CreateRepositoryInput) =>
    repositoryService.trackRepository(input),
  untrackRepository: (repositoryId: string) =>
    repositoryService.untrackRepository(repositoryId),
  reindex: (repositoryId: string, subpath?: string) =>
    repositoryService.reindex(repositoryId, subpath),
  track: (input: CreateRepositoryInput) =>
    repositoryService.trackRepository(input),
  untrack: (repositoryId: string, _shouldDelete = false) =>
    repositoryService.untrackRepository(repositoryId),
  list: () => repositoryService.listRepositories(),
  get: (repositoryId: string) => repositoryService.getRepository(repositoryId),
};