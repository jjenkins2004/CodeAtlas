import { vi } from "vitest";
import type { DebounceServicePort } from "../../services/util/DebounceService.js";

export type MockDebounceService = DebounceServicePort & {
  debounce: ReturnType<typeof vi.fn>;
  hasPending: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};

export function createMockDebounceService(
  overrides: Partial<DebounceServicePort> = {},
): MockDebounceService {
  return {
    debounce: vi.fn(),
    hasPending: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  } as MockDebounceService;
}
