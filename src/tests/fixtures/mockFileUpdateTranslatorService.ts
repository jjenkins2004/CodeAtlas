import { vi } from "vitest";
import type { DebounceServicePort } from "../../services/util/DebounceService.js";
import type {
  FileUpdateTranslatorServiceConfig,
  FileUpdateTranslatorServicePort,
} from "../../services/FileUpdateTranslatorService.js";

export type MockFileUpdateTranslatorServiceInstance =
  FileUpdateTranslatorServicePort & {
    repositoryId: string;
    debounceService?: DebounceServicePort;
    registerOnSymbolShouldBeReindexed: ReturnType<typeof vi.fn>;
    registerOnSymbolShouldBeDeleted: ReturnType<typeof vi.fn>;
    fileWasUpdated: ReturnType<typeof vi.fn>;
  };

export type MockFileUpdateTranslatorServiceType = new (
  config: FileUpdateTranslatorServiceConfig,
) => MockFileUpdateTranslatorServiceInstance;

export function createMockFileUpdateTranslatorServiceType(): MockFileUpdateTranslatorServiceType & {
  instances: MockFileUpdateTranslatorServiceInstance[];
} {
  const instances: MockFileUpdateTranslatorServiceInstance[] = [];

  class MockFileUpdateTranslatorService implements MockFileUpdateTranslatorServiceInstance {
    registerOnSymbolShouldBeReindexed = vi.fn();
    registerOnSymbolShouldBeDeleted = vi.fn();
    fileWasUpdated = vi.fn();

    constructor(public readonly config: FileUpdateTranslatorServiceConfig) {
      void config;
      this.repositoryId = config.repositoryId;
      this.debounceService = config.debounceService;
      instances.push(this);
    }

    public readonly repositoryId: string;

    public readonly debounceService?: DebounceServicePort;
  }

  return Object.assign(MockFileUpdateTranslatorService, { instances });
}
