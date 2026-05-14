import fs from "fs/promises";
import path from "path";
import { RepositoryNotFoundError } from "../../models/Repository.js";
import {
  repositoryDBService as defaultRepositoryDBService,
  type RepositoryDBServicePort,
} from "../../db/services/repository.js";
import { IgnoreFilter } from "./IgnoreFilter.js";

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

  /**
   * Recursively walks a directory and returns all file paths relative to
   * `dirPath`.
   */
  walkDirectory(dirPath: string): Promise<string[]>;
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

  async walkDirectory(dirPath: string): Promise<string[]> {
    const results: string[] = [];
    const ignoreFilter = IgnoreFilter.createFilter(dirPath);

    const walk = async (currentPath: string): Promise<void> => {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(dirPath, fullPath);

        if (ignoreFilter.ignores(relativePath)) {
          continue;
        }

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          results.push(relativePath);
        }
      }
    };

    await walk(dirPath);

    return results;
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

export const walkDirectory = (dirPath: string): Promise<string[]> =>
  repositoryPathService.walkDirectory(dirPath);
