import { vi } from "vitest";
import type { DebounceServicePort } from "../../services/util/DebounceService.js";
import type { FileUpdateTranslatorServicePort } from "../../services/FileUpdateTranslatorService.js";

export type MockFileUpdateTranslatorServiceInstance =
  FileUpdateTranslatorServicePort & {
    repositoryId: string;
    debounceService?: DebounceServicePort;
    registerOnSymbolShouldBeReindexed: ReturnType<typeof vi.fn>;
    registerOnSymbolShouldBeDeleted: ReturnType<typeof vi.fn>;
    fileWasUpdated: ReturnType<typeof vi.fn>;
  };

export type MockFileUpdateTranslatorServiceType = new (
  repositoryId: string,
  debounceService?: DebounceServicePort,
) => MockFileUpdateTranslatorServiceInstance;

export function createMockFileUpdateTranslatorServiceType(): MockFileUpdateTranslatorServiceType & {
  instances: MockFileUpdateTranslatorServiceInstance[];
} {
  const instances: MockFileUpdateTranslatorServiceInstance[] = [];

  class MockFileUpdateTranslatorService implements MockFileUpdateTranslatorServiceInstance {
    registerOnSymbolShouldBeReindexed = vi.fn();
    registerOnSymbolShouldBeDeleted = vi.fn();
    fileWasUpdated = vi.fn();

    constructor(
      public readonly repositoryId: string,
      public readonly debounceService?: DebounceServicePort,
    ) {
      instances.push(this);
    }
  }

  return Object.assign(MockFileUpdateTranslatorService, { instances });
}
