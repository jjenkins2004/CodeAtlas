import { vi } from "vitest";

export function createMockWatcher(overrides = {}) {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    stopAll: vi.fn(),
    ...overrides,
  };
}