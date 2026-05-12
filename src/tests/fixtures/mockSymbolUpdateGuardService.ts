import { vi } from "vitest";
import type { DebounceServicePort } from "../../services/DebounceService.js";
import type { SymbolUpdateGuardServicePort } from "../../services/SymbolUpdateGuardService.js";

export type MockSymbolUpdateGuardServiceInstance =
  SymbolUpdateGuardServicePort & {
    repositoryId: string;
    debounceService?: DebounceServicePort;
    registerOnSymbolShouldBeReindexed: ReturnType<typeof vi.fn>;
    fileWasUpdated: ReturnType<typeof vi.fn>;
  };

export type MockSymbolUpdateGuardServiceType = new (
  repositoryId: string,
  debounceService?: DebounceServicePort,
) => MockSymbolUpdateGuardServiceInstance;

export function createMockSymbolUpdateGuardServiceType(): MockSymbolUpdateGuardServiceType & {
  instances: MockSymbolUpdateGuardServiceInstance[];
} {
  const instances: MockSymbolUpdateGuardServiceInstance[] = [];

  class MockSymbolUpdateGuardService implements MockSymbolUpdateGuardServiceInstance {
    registerOnSymbolShouldBeReindexed = vi.fn();
    fileWasUpdated = vi.fn();

    constructor(
      public readonly repositoryId: string,
      public readonly debounceService?: DebounceServicePort,
    ) {
      instances.push(this);
    }
  }

  return Object.assign(MockSymbolUpdateGuardService, { instances });
}
