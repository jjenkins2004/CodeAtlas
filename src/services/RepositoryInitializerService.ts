import {
  repositoryDBService as defaultRepositoryDBService,
  type RepositoryDBServicePort,
} from "../db/services/repository.js";
import {
  fileDBService as defaultFileDBService,
  type FileDBServicePort,
} from "../db/services/file.js";
import {
  indexerService as defaultIndexerService,
  type IndexerServicePort,
} from "./IndexerService.js";
import {
  hasherService as defaultHasherService,
  type HasherServicePort,
} from "./util/Hasher.js";
import {
  treeSitterService as defaultTreeSitterService,
  type TreeSitterService,
} from "./treesitter/TreeSitter.js";
import {
  repositoryPathService as defaultRepositoryPathService,
  type RepositoryPathServicePort,
} from "./util/RepositoryPathService.js";
import { RepositoryNotFoundError } from "../models/Repository.js";

export interface RepositoryInitializerServicePort {
  /**
   * Crawls all eligible files in a repository, persists file records, extracts
   * symbols via tree-sitter, and forwards each symbol to the indexer. No-ops
   * while the same repository is already being initialized.
   */
  initializeRepository(repositoryId: string): Promise<void>;

  /** Returns true while a repository initialization is in progress. */
  isInitializing(repositoryId: string): boolean;
}

export interface RepositoryInitializerServiceConfig {
  repositoryDBService?: RepositoryDBServicePort;
  fileDBService?: FileDBServicePort;
  indexerService?: IndexerServicePort;
  hasherService?: HasherServicePort;
  treeSitterService?: TreeSitterService;
  repositoryPathService?: RepositoryPathServicePort;
}

const defaultRepositoryInitializerServiceConfig: Required<RepositoryInitializerServiceConfig> =
  {
    repositoryDBService: defaultRepositoryDBService,
    fileDBService: defaultFileDBService,
    indexerService: defaultIndexerService,
    hasherService: defaultHasherService,
    treeSitterService: defaultTreeSitterService,
    repositoryPathService: defaultRepositoryPathService,
  };

export class RepositoryInitializerService implements RepositoryInitializerServicePort {
  private readonly config: Required<RepositoryInitializerServiceConfig>;
  private readonly initializingRepositories = new Set<string>();

  constructor(config: RepositoryInitializerServiceConfig = {}) {
    this.config = {
      ...defaultRepositoryInitializerServiceConfig,
      ...config,
    };
  }

  isInitializing(repositoryId: string): boolean {
    return this.initializingRepositories.has(repositoryId);
  }

  async initializeRepository(repositoryId: string): Promise<void> {
    if (this.initializingRepositories.has(repositoryId)) {
      return;
    }

    this.initializingRepositories.add(repositoryId);

    try {
      const repository =
        await this.config.repositoryDBService.getRepository(repositoryId);

      if (!repository) {
        throw new RepositoryNotFoundError(repositoryId);
      }

      const relativePaths =
        await this.config.repositoryPathService.walkDirectory(repository.path);

      for (const relativePath of relativePaths) {
        const fullPath = this.config.repositoryPathService.toRepositoryFullPath(
          repository.path,
          relativePath,
        );

        await this.indexFile(repositoryId, fullPath, relativePath);
      }
    } finally {
      this.initializingRepositories.delete(repositoryId);
    }
  }

  private async indexFile(
    repositoryId: string,
    fullPath: string,
    relativePath: string,
  ): Promise<void> {
    let symbols;

    try {
      symbols = await this.config.treeSitterService.extractSymbols(fullPath);
    } catch {
      // No tree-sitter adapter registered for this file type — skip it.
      return;
    }

    if (symbols.length === 0) {
      return;
    }

    const fileHash = await this.config.hasherService.hashFile(fullPath);
    const file = await this.config.fileDBService.upsertFile({
      repositoryId,
      path: relativePath,
      hash: fileHash,
    });

    for (const extracted of symbols) {
      const symbolHash = this.config.hasherService.hashCodeBlock(
        extracted.body,
      );

      await this.config.indexerService.indexSymbol({
        repositoryId,
        symbol: extracted.symbol,
        fileId: file.id,
        hash: symbolHash,
        type: extracted.type,
        visibility: extracted.visibility,
        body: extracted.body,
      });
    }
  }
}

export const repositoryInitializerService = new RepositoryInitializerService();
