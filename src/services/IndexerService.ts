import type { Symbol } from "../models/Symbol.js";

export interface IndexerServicePort {
  /** Indexes a single symbol record for a repository. */
  indexSymbol(symbol: Symbol): Promise<void>;
  /** Indexes every eligible symbol found in a single file within a repository. */
  indexRepositoryFile(repositoryId: string, filePath: string): Promise<void>;
  /** Indexes every eligible file and symbol for the given repository. */
  indexRepository(repositoryId: string): Promise<void>;
}

export class IndexerService implements IndexerServicePort {
  /** Indexes a single symbol record for a repository. */
  async indexSymbol(_symbol: Symbol): Promise<void> {
    throw new Error("Symbol indexing is not implemented yet");
  }

  /** Indexes every eligible symbol found in a single file within a repository. */
  async indexRepositoryFile(
    _repositoryId: string,
    _filePath: string,
  ): Promise<void> {
    throw new Error("Repository file indexing is not implemented yet");
  }

  /** Indexes every eligible file and symbol for the given repository. */
  async indexRepository(_repositoryId: string): Promise<void> {
    throw new Error("Repository indexing is not implemented yet");
  }
}

export const indexerService = new IndexerService();

/** Indexes a single symbol record for a repository. */
export const indexSymbol = (symbol: Symbol): Promise<void> =>
  indexerService.indexSymbol(symbol);

/** Indexes every eligible symbol found in a single file within a repository. */
export const indexRepositoryFile = (
  repositoryId: string,
  filePath: string,
): Promise<void> => indexerService.indexRepositoryFile(repositoryId, filePath);

/** Indexes every eligible file and symbol for the given repository. */
export const indexRepository = (repositoryId: string): Promise<void> =>
  indexerService.indexRepository(repositoryId);
