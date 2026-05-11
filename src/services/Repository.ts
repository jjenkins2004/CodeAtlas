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
  indexerService as defaultIndexerService,
  type IndexerServicePort,
} from "./IndexerService.js";
import {
  FileReindexService,
  type FileReindexServicePort,
} from "./FileReindex.js";
import { Watcher } from "./Watcher.js";

export interface RepositoryOrchestratorServiceConfig {
  repositoryDBService?: RepositoryDBServicePort;
  indexService?: IndexerServicePort;
  fileReindexService?: FileReindexServicePort;
  watcher?: Watcher;
}

const defaultRepositoryOrchestratorServiceConfig: Required<RepositoryOrchestratorServiceConfig> =
  {
    repositoryDBService: defaultRepositoryDBService,
    indexService: defaultIndexerService,
    fileReindexService: new FileReindexService(),
    watcher: new Watcher(),
  };

export class RepositoryOrchestratorService {
  private readonly config: Required<RepositoryOrchestratorServiceConfig>;

  constructor(config: RepositoryOrchestratorServiceConfig = {}) {
    this.config = {
      ...defaultRepositoryOrchestratorServiceConfig,
      ...config,
    };

    this.config.fileReindexService.registerOnFileShouldBeReindexed(
      (filePath: string) => {
        this.handleFileShouldBeReindexed(filePath);
      },
    );
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
      await this.config.repositoryDBService.createRepository(repositoryInput);

    await this.runTrackStep(createdRepository.id, () =>
      this.config.indexService.indexRepository(createdRepository),
    );

    await this.runTrackStep(createdRepository.id, () =>
      this.startWatcher(createdRepository),
    );

    return createdRepository;
  }

  async untrackRepository(repositoryId: string): Promise<void> {
    const repository =
      await this.config.repositoryDBService.getRepository(repositoryId);

    if (!repository) {
      throw new RepositoryNotFoundError(repositoryId);
    }

    await this.safeStopWatcher(repositoryId);

    const removed =
      await this.config.repositoryDBService.removeRepository(repositoryId);

    if (!removed) {
      throw new RepositoryNotFoundError(repositoryId);
    }
  }

  private async startWatcher(repository: Repository): Promise<void> {
    await this.config.watcher.start({
      repositoryId: repository.id,
      rootPath: repository.path,
      ignoreFilter: IgnoreFilter.createFilter(repository.path),
      onCreation: (filePath) => {},
      onUpdate: (filePath) => {
        this.config.fileReindexService.fileWasUpdated(filePath);
      },
      onDeletion: (filePath) => {},
    });
  }

  private handleFileShouldBeReindexed(filePath: string): void {
    this.config.indexService.indexFile(filePath);
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
      await this.config.watcher.stop(repositoryId);
    } catch (error) {
      console.warn(`Failed to stop watcher for ${repositoryId}:`, error);
    }
  }

  private async rollbackCreatedRepository(repositoryId: string): Promise<void> {
    await this.safeStopWatcher(repositoryId);

    try {
      const removed =
        await this.config.repositoryDBService.removeRepository(repositoryId);

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
};
