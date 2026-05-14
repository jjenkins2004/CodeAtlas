import { vi } from "vitest";
import type { EmbeddingServicePort } from "../../services/EmbeddingService.js";

export type MockEmbeddingService = EmbeddingServicePort & {
  isConfigured: ReturnType<typeof vi.fn>;
  embed: ReturnType<typeof vi.fn>;
};

export function createMockEmbeddingService(
  overrides: Partial<EmbeddingServicePort> = {},
): MockEmbeddingService {
  return {
    isConfigured: vi.fn().mockReturnValue(true),
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    ...overrides,
  } as MockEmbeddingService;
}
