import { vi } from "vitest";
import type { RepositoryInitializerServicePort } from "../../services/RepositoryInitializerService.js";

export type MockRepositoryInitializerService =
  RepositoryInitializerServicePort & {
    initializeRepository: ReturnType<typeof vi.fn>;
    isInitializing: ReturnType<typeof vi.fn>;
  };

export function createMockRepositoryInitializerService(
  overrides: Partial<RepositoryInitializerServicePort> = {},
): MockRepositoryInitializerService {
  return {
    initializeRepository: vi.fn(),
    isInitializing: vi.fn().mockReturnValue(false),
    ...overrides,
  } as unknown as MockRepositoryInitializerService;
}
