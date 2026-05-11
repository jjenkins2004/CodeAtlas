import type { Repository } from "../models/Repository.js";

export interface RepositoryIndexerServicePort {
  indexRepository(repository: Repository): Promise<void>;
}

export class RepositoryIndexerService implements RepositoryIndexerServicePort {
  async indexRepository(_repository: Repository): Promise<void> {
    throw new Error("index not implemented");
  }
}

export const repositoryIndexerService = new RepositoryIndexerService();
