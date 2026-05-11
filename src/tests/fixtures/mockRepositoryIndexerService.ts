import { vi } from "vitest";
import type { IndexerServicePort } from "../../services/IndexerService.js";

export type MockRepositoryIndexerService = IndexerServicePort & {
  indexSymbol: ReturnType<typeof vi.fn>;
  indexRepositoryFile: ReturnType<typeof vi.fn>;
  indexRepository: ReturnType<typeof vi.fn>;
};

export function createMockRepositoryIndexerService(
  overrides: Partial<IndexerServicePort> = {},
): MockRepositoryIndexerService {
  return {
    indexSymbol: vi.fn(),
    indexRepositoryFile: vi.fn(),
    indexRepository: vi.fn(),
    ...overrides,
  } as unknown as MockRepositoryIndexerService;
}
