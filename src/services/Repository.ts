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
  repositoryDBService,
} from "../db/services/repository.js";
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

    const createdRepository =
      await repositoryDBService.createRepository(repositoryInput);

    await this.runTrackStep(createdRepository.id, () => {
      throw new Error("index not implemented");
    });

    await this.runTrackStep(createdRepository.id, () =>
      this.startWatcher(createdRepository),
    );

    return createdRepository;
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
      const removed = await repositoryDBService.removeRepository(repositoryId);

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
