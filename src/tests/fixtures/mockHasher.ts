import { vi } from "vitest";
import type { HasherServicePort } from "../../services/util/Hasher.js";

export type MockHasherServiceInstance = HasherServicePort & {
  hashText: ReturnType<typeof vi.fn>;
  hashFile: ReturnType<typeof vi.fn>;
  hashCodeBlock: ReturnType<typeof vi.fn>;
};

/**
 * Creates a mock hasher service with spyable hash methods.
 */
export function createMockHasherService(
  overrides: Partial<MockHasherServiceInstance> = {},
): MockHasherServiceInstance {
  return {
    hashText: vi.fn(),
    hashFile: vi.fn(),
    hashCodeBlock: vi.fn(),
    ...overrides,
  } as MockHasherServiceInstance;
}
