import { vi } from "vitest";
import type { FileDBServicePort } from "../../db/services/file.js";

export type MockFileDBService = FileDBServicePort & {
  listFiles: ReturnType<typeof vi.fn>;
  getFile: ReturnType<typeof vi.fn>;
  getFileByRepositoryAndPath: ReturnType<typeof vi.fn>;
  createFile: ReturnType<typeof vi.fn>;
  updateFile: ReturnType<typeof vi.fn>;
  removeFile: ReturnType<typeof vi.fn>;
};

export function createMockFileDBService(
  overrides: Partial<FileDBServicePort> = {},
): MockFileDBService {
  return {
    listFiles: vi.fn(),
    getFile: vi.fn(),
    getFileByRepositoryAndPath: vi.fn(),
    createFile: vi.fn(),
    updateFile: vi.fn(),
    removeFile: vi.fn(),
    ...overrides,
  } as MockFileDBService;
}