import { vi } from "vitest";
import type { IndexerServicePort } from "../../services/IndexerService.js";

export type MockRepositoryIndexerService = IndexerServicePort & {
  indexRepository: ReturnType<typeof vi.fn>;
  indexFile: ReturnType<typeof vi.fn>;
};

export function createMockRepositoryIndexerService(
  overrides: Partial<IndexerServicePort> = {},
): MockRepositoryIndexerService {
  return {
    indexRepository: vi.fn(),
    indexFile: vi.fn(),
    ...overrides,
  } as MockRepositoryIndexerService;
}
