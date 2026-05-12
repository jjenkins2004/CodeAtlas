import { vi } from "vitest";
import type { SymbolDBService } from "../../db/services/symbol.js";

export type MockSymbolDBService = SymbolDBService & {
  listSymbolsByRepositoryFile: ReturnType<typeof vi.fn>;
  removeSymbol: ReturnType<typeof vi.fn>;
};

export function createMockSymbolDBService(
  overrides: Partial<SymbolDBService> = {},
): MockSymbolDBService {
  return {
    listSymbolsByRepositoryFile: vi.fn(),
    removeSymbol: vi.fn(),
    ...overrides,
  } as MockSymbolDBService;
}