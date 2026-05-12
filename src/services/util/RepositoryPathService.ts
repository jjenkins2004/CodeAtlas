import path from "path";
import { RepositoryNotFoundError } from "../../models/Repository.js";
import {
  repositoryDBService as defaultRepositoryDBService,
  type RepositoryDBServicePort,
} from "../../db/services/repository.js";

export interface RepositoryPathServicePort {
  toRepositoryRelativePath(
    repositoryRootPath: string,
    filePath: string,
  ): string;

  toRepositoryFullPath(
    repositoryRootPath: string,
    repositoryRelativePath: string,
  ): string;

  toRepositoryFullPathByRepositoryId(
    repositoryId: string,
    repositoryRelativePath: string,
  ): Promise<string>;
}

export type RepositoryPathServiceConstructor = new (
  repositoryDBService?: RepositoryDBServicePort,
) => RepositoryPathServicePort;

export class RepositoryPathService implements RepositoryPathServicePort {
  constructor(
    private readonly repositoryDBService: RepositoryDBServicePort = defaultRepositoryDBService,
  ) {}

  toRepositoryRelativePath(
    repositoryRootPath: string,
    filePath: string,
  ): string {
    return path.relative(repositoryRootPath, filePath);
  }

  toRepositoryFullPath(
    repositoryRootPath: string,
    repositoryRelativePath: string,
  ): string {
    return path.resolve(repositoryRootPath, repositoryRelativePath);
  }

  async toRepositoryFullPathByRepositoryId(
    repositoryId: string,
    repositoryRelativePath: string,
  ): Promise<string> {
    const repository =
      await this.repositoryDBService.getRepository(repositoryId);

    if (!repository) {
      throw new RepositoryNotFoundError(repositoryId);
    }

    return this.toRepositoryFullPath(repository.path, repositoryRelativePath);
  }
}

export const repositoryPathService = new RepositoryPathService();

export const toRepositoryRelativePath = (
  repositoryRootPath: string,
  filePath: string,
): string =>
  repositoryPathService.toRepositoryRelativePath(repositoryRootPath, filePath);

export const toRepositoryFullPath = (
  repositoryRootPath: string,
  repositoryRelativePath: string,
): string =>
  repositoryPathService.toRepositoryFullPath(
    repositoryRootPath,
    repositoryRelativePath,
  );

export const toRepositoryFullPathByRepositoryId = (
  repositoryId: string,
  repositoryRelativePath: string,
): Promise<string> =>
  repositoryPathService.toRepositoryFullPathByRepositoryId(
    repositoryId,
    repositoryRelativePath,
  );
