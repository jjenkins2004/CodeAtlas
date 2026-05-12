import { vi } from "vitest";
import type { FileUpdateServicePort } from "../../services/FileUpdateService.js";

export type MockFileUpdateService = FileUpdateServicePort & {
  handleFileUpdate: ReturnType<typeof vi.fn>;
  removeRepository: ReturnType<typeof vi.fn>;
};

export function createMockFileUpdateService(
  overrides: Partial<FileUpdateServicePort> = {},
): MockFileUpdateService {
  return {
    handleFileUpdate: vi.fn(),
    removeRepository: vi.fn(),
    ...overrides,
  } as MockFileUpdateService;
}
