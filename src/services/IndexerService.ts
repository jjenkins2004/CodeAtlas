import type { Repository } from "../models/Repository.js";

export interface IndexerServicePort {
  indexRepository(repository: Repository): Promise<void>;
  indexFile(filePath: string): Promise<void>;
}

export class IndexerService implements IndexerServicePort {
  async indexRepository(_repository: Repository): Promise<void> {
    throw new Error("Repository indexing is not implemented yet");
  }

  async indexFile(_filePath: string): Promise<void> {
    throw new Error("File indexing is not implemented yet");
  }
}

export const indexerService = new IndexerService();
