import type {
  CreateRepositoryInput,
  Repository,
} from "../models/Repository.js";
import { RepositoryService as orchestratorService } from "./Repository.js";
import { repositoryDBService } from "../db/services/repository.js";
import { repositoryInitializerService } from "./RepositoryInitializerService.js";

class RepositoryApiService {
  async track(input: CreateRepositoryInput): Promise<Repository> {
    return orchestratorService.trackRepository(input);
  }

  async list(): Promise<Repository[]> {
    return repositoryDBService.listRepositories();
  }

  async get(repositoryId: string): Promise<Repository | null> {
    return repositoryDBService.getRepository(repositoryId);
  }

  async untrack(repositoryId: string, shouldDelete?: boolean): Promise<void> {
    void shouldDelete;
    await orchestratorService.untrackRepository(repositoryId);
  }

  async start(repositoryName: string): Promise<Repository> {
    return orchestratorService.startTracking(repositoryName);
  }

  async reindex(repositoryId: string, subpath?: string): Promise<void> {
    void subpath;
    await repositoryInitializerService.initializeRepository(repositoryId);
  }
}

export const RepositoryService = new RepositoryApiService();
