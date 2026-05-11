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
import type { Symbol } from "../models/Symbol.js";
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
  SymbolUpdateGuardService,
  type SymbolUpdateGuardServiceConstructor,
  type SymbolUpdateGuardServicePort,
} from "./SymbolUpdateGuardService.js";
import { Watcher, type WatcherPort } from "./Watcher.js";

export interface RepositoryOrchestratorServiceConfig {
  repositoryDBService?: RepositoryDBServicePort;
  indexService?: IndexerServicePort;
  symbolUpdateGuardServiceType?: SymbolUpdateGuardServiceConstructor;
  watcher?: WatcherPort;
}

const defaultRepositoryOrchestratorServiceConfig: Required<RepositoryOrchestratorServiceConfig> =
  {
    repositoryDBService: defaultRepositoryDBService,
    indexService: defaultIndexerService,
    symbolUpdateGuardServiceType: SymbolUpdateGuardService,
    watcher: new Watcher(),
  };

export class RepositoryOrchestratorService {
  private readonly config: Required<RepositoryOrchestratorServiceConfig>;
  private readonly symbolUpdateGuardServices = new Map<
    string,
    SymbolUpdateGuardServicePort
  >();

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
    const repositoryPath = await this.validateAndNormalizeRepositoryPath(
      input.path,
    );

    const repositoryInput: CreateRepositoryInput = {
      name: input.name,
      path: repositoryPath,
    };

    const createdRepository =
      await this.config.repositoryDBService.createRepository(repositoryInput);

    const symbolUpdateGuardService = this.getOrCreateSymbolUpdateGuardService(
      createdRepository.id,
    );

    await this.runTrackStep(createdRepository.id, () =>
      this.startWatcher(createdRepository, symbolUpdateGuardService),
    );

    await this.runTrackStep(createdRepository.id, () =>
      this.config.indexService.indexRepository(createdRepository.id),
    );

    return createdRepository;
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

    this.symbolUpdateGuardServices.delete(repositoryId);
  }

  private async startWatcher(
    repository: Repository,
    symbolUpdateGuardService: SymbolUpdateGuardServicePort,
  ): Promise<void> {
    await this.config.watcher.start({
      repositoryId: repository.id,
      rootPath: repository.path,
      ignoreFilter: IgnoreFilter.createFilter(repository.path),
      onCreation: (filePath) => {
        symbolUpdateGuardService.fileWasCreated(filePath);
      },
      onUpdate: (filePath) => {
        symbolUpdateGuardService.fileWasUpdated(filePath);
      },
      onDeletion: (filePath) => {
        symbolUpdateGuardService.fileWasDeleted(filePath);
      },
    });
  }

  private getOrCreateSymbolUpdateGuardService(
    repositoryId: string,
  ): SymbolUpdateGuardServicePort {
    const existingSymbolUpdateGuardService =
      this.symbolUpdateGuardServices.get(repositoryId);

    if (existingSymbolUpdateGuardService) {
      return existingSymbolUpdateGuardService;
    }

    const symbolUpdateGuardService =
      new this.config.symbolUpdateGuardServiceType(repositoryId);

    symbolUpdateGuardService.registerOnSymbolShouldBeReindexed(
      (symbol: Symbol) => {
        void this.config.indexService.indexSymbol(symbol);
      },
    );

    this.symbolUpdateGuardServices.set(repositoryId, symbolUpdateGuardService);

    return symbolUpdateGuardService;
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
    this.symbolUpdateGuardServices.delete(repositoryId);

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

/**
 * Validates and registers a repository, then begins tracking and indexing it.
 */
export async function trackRepository(
  input: CreateRepositoryInput,
): Promise<Repository> {
  return repositoryService.trackRepository(input);
}

/**
 * Stops tracking a repository and removes its repository record.
 */
export async function untrackRepository(repositoryId: string): Promise<void> {
  return repositoryService.untrackRepository(repositoryId);
}

export const RepositoryService = {
  track: trackRepository,
  untrack: untrackRepository,
};
