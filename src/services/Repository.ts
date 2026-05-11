import fs from "fs/promises";
import path from "path";
import {
  RepositoryPathNotFoundError,
  RepositoryPathNotDirectoryError,
  RepositoryIndexingError,
  RepositoryNotFoundError,
  CreateRepositoryInput,
  Repository,
} from "../models/Repository.js";
import {
  repositoryDBService as defaultRepositoryDBService,
  type RepositoryDBServicePort,
} from "../db/services/repository.js";
import { IgnoreFilter } from "./IgnoreFilter.js";
import {
  repositoryIndexerService as defaultRepositoryIndexerService,
  type RepositoryIndexerServicePort,
} from "./RepositoryIndexer.js";
import { Watcher } from "./Watcher.js";

export class RepositoryOrchestratorService {
  private readonly repositoryDBService: RepositoryDBServicePort;
  private readonly repositoryIndexerService: RepositoryIndexerServicePort;
  private readonly watcher: Watcher;

  constructor(
    repositoryDBService: RepositoryDBServicePort = defaultRepositoryDBService,
    repositoryIndexerService: RepositoryIndexerServicePort = defaultRepositoryIndexerService,
    watcher: Watcher = new Watcher(),
  ) {
    this.repositoryDBService = repositoryDBService;
    this.repositoryIndexerService = repositoryIndexerService;
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

    const createdRepository =
      await this.repositoryDBService.createRepository(repositoryInput);

    await this.runTrackStep(createdRepository.id, () =>
      this.repositoryIndexerService.indexRepository(createdRepository),
    );

    await this.runTrackStep(createdRepository.id, () =>
      this.startWatcher(createdRepository),
    );

    return createdRepository;
  }

  async untrackRepository(repositoryId: string): Promise<void> {
    const repository =
      await this.repositoryDBService.getRepository(repositoryId);

    if (!repository) {
      throw new RepositoryNotFoundError(repositoryId);
    }

    await this.safeStopWatcher(repositoryId);

    const removed =
      await this.repositoryDBService.removeRepository(repositoryId);

    if (!removed) {
      throw new RepositoryNotFoundError(repositoryId);
    }
  }

  async listRepositories(): Promise<Repository[]> {
    return this.repositoryDBService.listRepositories();
  }

  async getRepository(repositoryId: string): Promise<Repository | null> {
    return this.repositoryDBService.getRepository(repositoryId);
  }

  private async startWatcher(repository: Repository): Promise<void> {
    await this.watcher.start({
      repositoryId: repository.id,
      rootPath: repository.path,
      ignoreFilter: IgnoreFilter.createFilter(repository.path),
      onCreation: (filePath) => {},
      onUpdate: (filePath) => {},
      onDeletion: (filePath) => {},
    });
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

  private async safeStopWatcher(repositoryId: string): Promise<void> {
    try {
      await this.watcher.stop(repositoryId);
    } catch (error) {
      console.warn(`Failed to stop watcher for ${repositoryId}:`, error);
    }
  }

  private async rollbackCreatedRepository(repositoryId: string): Promise<void> {
    await this.safeStopWatcher(repositoryId);

    try {
      const removed =
        await this.repositoryDBService.removeRepository(repositoryId);

      if (!removed) {
        console.warn(
          `Failed to remove repository ${repositoryId} during rollback`,
        );
      }
    } catch (error) {
      console.warn(
        `Failed to remove repository ${repositoryId} during rollback:`,
        error,
      );
    }
  }

  private async runTrackStep<T>(
    repositoryId: string,
    step: () => Promise<T>,
  ): Promise<T> {
    try {
      return await step();
    } catch (error) {
      await this.rollbackCreatedRepository(repositoryId);

      if (error instanceof RepositoryIndexingError) {
        throw error;
      }

      throw new RepositoryIndexingError(repositoryId, error);
    }
  }
}

export const repositoryService = new RepositoryOrchestratorService();

export const RepositoryService = {
  trackRepository: (input: CreateRepositoryInput) =>
    repositoryService.trackRepository(input),
  untrackRepository: (repositoryId: string) =>
    repositoryService.untrackRepository(repositoryId),
  track: (input: CreateRepositoryInput) =>
    repositoryService.trackRepository(input),
  untrack: (repositoryId: string, _shouldDelete = false) =>
    repositoryService.untrackRepository(repositoryId),
  list: () => repositoryService.listRepositories(),
  get: (repositoryId: string) => repositoryService.getRepository(repositoryId),
};
