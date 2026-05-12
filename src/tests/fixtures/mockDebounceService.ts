import { vi } from "vitest";
import type { DebounceServicePort } from "../../services/DebounceService.js";

export type MockDebounceService = DebounceServicePort & {
  debounce: ReturnType<typeof vi.fn>;
  hasPending: ReturnType<typeof vi.fn>;
};

export function createMockDebounceService(
  overrides: Partial<DebounceServicePort> = {},
): MockDebounceService {
  return {
    debounce: vi.fn(),
    hasPending: vi.fn(),
    ...overrides,
  } as MockDebounceService;
}
