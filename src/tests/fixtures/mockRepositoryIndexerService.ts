import { vi } from "vitest";
import type { RepositoryIndexerServicePort } from "../../services/RepositoryIndexer.js";

export type MockRepositoryIndexerService = RepositoryIndexerServicePort & {
  indexRepository: ReturnType<typeof vi.fn>;
};

export function createMockRepositoryIndexerService(
  overrides: Partial<RepositoryIndexerServicePort> = {},
): MockRepositoryIndexerService {
  return {
    indexRepository: vi.fn(),
    ...overrides,
  } as MockRepositoryIndexerService;
}
