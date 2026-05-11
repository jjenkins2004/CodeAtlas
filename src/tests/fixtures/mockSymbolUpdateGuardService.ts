import { vi } from "vitest";
import type { SymbolUpdateGuardServicePort } from "../../services/SymbolUpdateGuardService.js";

export type MockSymbolUpdateGuardServiceInstance =
  SymbolUpdateGuardServicePort & {
    repositoryId: string;
    registerOnSymbolShouldBeReindexed: ReturnType<typeof vi.fn>;
    fileWasCreated: ReturnType<typeof vi.fn>;
    fileWasUpdated: ReturnType<typeof vi.fn>;
    fileWasDeleted: ReturnType<typeof vi.fn>;
  };

export type MockSymbolUpdateGuardServiceType = new (
  repositoryId: string,
) => MockSymbolUpdateGuardServiceInstance;

export function createMockSymbolUpdateGuardServiceType(): MockSymbolUpdateGuardServiceType & {
  instances: MockSymbolUpdateGuardServiceInstance[];
} {
  const instances: MockSymbolUpdateGuardServiceInstance[] = [];

  class MockSymbolUpdateGuardService implements MockSymbolUpdateGuardServiceInstance {
    registerOnSymbolShouldBeReindexed = vi.fn();
    fileWasCreated = vi.fn();
    fileWasUpdated = vi.fn();
    fileWasDeleted = vi.fn();

    constructor(public readonly repositoryId: string) {
      instances.push(this);
    }
  }

  return Object.assign(MockSymbolUpdateGuardService, { instances });
}
