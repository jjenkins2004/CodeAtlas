import { vi } from "vitest";
import type { FileReindexServicePort } from "../../services/FileReindex.js";

export type MockFileReindexService = FileReindexServicePort & {
  registerOnFileShouldBeReindexed: ReturnType<typeof vi.fn>;
  fileWasUpdated: ReturnType<typeof vi.fn>;
};

export function createMockFileReindexService(): MockFileReindexService {
  return {
    registerOnFileShouldBeReindexed: vi.fn(),
    fileWasUpdated: vi.fn(),
  } as MockFileReindexService;
}
