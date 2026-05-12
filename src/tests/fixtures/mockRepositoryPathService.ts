import path from "path";
import { vi } from "vitest";
import type { RepositoryPathServicePort } from "../../services/util/RepositoryPathService.js";

export type MockRepositoryPathService = RepositoryPathServicePort & {
  toRepositoryRelativePath: ReturnType<typeof vi.fn>;
  toRepositoryFullPath: ReturnType<typeof vi.fn>;
  toRepositoryFullPathByRepositoryId: ReturnType<typeof vi.fn>;
};

export function createMockRepositoryPathService(): MockRepositoryPathService {
  return {
    toRepositoryRelativePath: vi.fn(
      (repositoryRootPath: string, filePath: string) =>
        path.relative(repositoryRootPath, filePath),
    ),
    toRepositoryFullPath: vi.fn(
      (repositoryRootPath: string, repositoryRelativePath: string) =>
        path.resolve(repositoryRootPath, repositoryRelativePath),
    ),
    toRepositoryFullPathByRepositoryId: vi.fn(),
  } as MockRepositoryPathService;
}
