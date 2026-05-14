import {
  RepositoryIndexingError,
  RepositoryNotFoundError,
  CreateRepositoryInput,
  Repository,
} from "../models/Repository.js";
import {
  repositoryDBService as defaultRepositoryDBService,
  type RepositoryDBServicePort,
} from "../db/services/repository.js";
import { IgnoreFilter } from "./util/IgnoreFilter.js";
import {
  repositoryInitializerService as defaultRepositoryInitializerService,
  type RepositoryInitializerServicePort,
} from "./RepositoryInitializerService.js";
import {
  fileUpdateService as defaultFileUpdateService,
  type FileUpdateServicePort,
} from "./FileUpdateService.js";
import {
  repositoryPathService as defaultRepositoryPathService,
  type RepositoryPathServicePort,
} from "./util/RepositoryPathService.js";
import { Watcher, type WatcherPort } from "./Watcher.js";

export interface RepositoryOrchestratorServiceConfig {
  repositoryDBService?: RepositoryDBServicePort;
  repositoryInitializerService?: RepositoryInitializerServicePort;
  fileUpdateService?: FileUpdateServicePort;
  repositoryPathService?: RepositoryPathServicePort;
  watcher?: WatcherPort;
}

const defaultRepositoryOrchestratorServiceConfig: Required<RepositoryOrchestratorServiceConfig> =
  {
    repositoryDBService: defaultRepositoryDBService,
    repositoryInitializerService: defaultRepositoryInitializerService,
    fileUpdateService: defaultFileUpdateService,
    repositoryPathService: defaultRepositoryPathService,
    watcher: new Watcher(),
  };

enum RollbackStrategy {
  RemoveRepository = "remove-repository",
  StopWatcherOnly = "stop-watcher-only",
}

export class RepositoryOrchestratorService {
  private readonly config: Required<RepositoryOrchestratorServiceConfig>;

  constructor(config: RepositoryOrchestratorServiceConfig = {}) {
    this.config = {
      ...defaultRepositoryOrchestratorServiceConfig,
      ...config,
    };
  }

  /**
   * Validates and normalizes a repository path, creates the repository record,
   * starts the file watcher, and kicks off an initial repository index.
   *
   * If any step fails, the repository record and watcher registration are rolled
   * back before the error is surfaced to the caller.
   */
  async trackRepository(input: CreateRepositoryInput): Promise<Repository> {
    const repositoryPath =
      await this.config.repositoryPathService.validateAndNormalizeRepositoryPath(
        input.path,
      );

    const repositoryInput: CreateRepositoryInput = {
      name: input.name,
      path: repositoryPath,
    };

    const createdRepository =
      await this.config.repositoryDBService.createRepository(repositoryInput);

    await this.runTrackStep(
      createdRepository.id,
      () => this.startWatcher(createdRepository),
      RollbackStrategy.RemoveRepository,
    );

    await this.runTrackStep(
      createdRepository.id,
      () =>
        this.config.repositoryInitializerService.initializeRepository(
          createdRepository.id,
        ),
      RollbackStrategy.RemoveRepository,
    );

    return createdRepository;
  }

  /**
   * Starts active tracking for an already-registered repository by name.
   *
   * This starts the watcher and kicks off initialization/indexing without
   * creating or deleting any repository records.
   */
  async startTracking(repositoryName: string): Promise<Repository> {
    const repository =
      await this.config.repositoryDBService.getRepositoryByName(repositoryName);

    if (!repository) {
      throw new RepositoryNotFoundError(repositoryName);
    }

    await this.runTrackStep(
      repository.id,
      () => this.startWatcher(repository),
      RollbackStrategy.StopWatcherOnly,
    );

    const repositoryRelativePaths =
      await this.config.repositoryPathService.walkDirectory(repository.path);

    for (const repositoryRelativePath of repositoryRelativePaths) {
      try {
        this.config.fileUpdateService.handleFileUpdate(
          repository.id,
          repository.path,
          repositoryRelativePath,
          "changed",
        );
      } catch (error) {
        console.warn(
          `Failed to queue replay update for ${repository.id}:${repositoryRelativePath}`,
          error,
        );
      }
    }

    return repository;
  }

  /**
   * Stops tracking an existing repository, shuts down its watcher, removes the
   * repository record, and clears any cached symbol update guard state.
   */
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

    this.config.fileUpdateService.removeRepository(repositoryId);
  }

  private async startWatcher(repository: Repository): Promise<void> {
    await this.config.watcher.start({
      repositoryId: repository.id,
      rootPath: repository.path,
      ignoreFilter: IgnoreFilter.createFilter(repository.path),
      onCreation: (relativePath) => {
        this.config.fileUpdateService.handleFileUpdate(
          repository.id,
          repository.path,
          relativePath,
          "changed",
        );
      },
      onUpdate: (relativePath) => {
        this.config.fileUpdateService.handleFileUpdate(
          repository.id,
          repository.path,
          relativePath,
          "changed",
        );
      },
      onDeletion: (relativePath) => {
        this.config.fileUpdateService.handleFileUpdate(
          repository.id,
          repository.path,
          relativePath,
          "deleted",
        );
      },
    });
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
    this.config.fileUpdateService.removeRepository(repositoryId);

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
    rollbackStrategy: RollbackStrategy,
  ): Promise<T> {
    try {
      return await step();
    } catch (error) {
      if (rollbackStrategy === RollbackStrategy.RemoveRepository) {
        await this.rollbackCreatedRepository(repositoryId);
      } else {
        await this.safeStopWatcher(repositoryId);
      }

      if (error instanceof RepositoryIndexingError) {
        throw error;
      }

      throw new RepositoryIndexingError(repositoryId, error);
    }
  }
}

export const RepositoryService = new RepositoryOrchestratorService();
