import type { Symbol } from "../models/Symbol.js";

export type SymbolUpdateGuardCallback = (symbol: Symbol) => void;

export type SymbolUpdateGuardServiceConstructor = new (
  repositoryId: string,
) => SymbolUpdateGuardServicePort;

export interface SymbolUpdateGuardServicePort {
  registerOnSymbolShouldBeReindexed(callback: SymbolUpdateGuardCallback): void;
  fileWasCreated(filePath: string): void;
  fileWasUpdated(filePath: string): void;
  fileWasDeleted(filePath: string): void;
}

export class SymbolUpdateGuardService implements SymbolUpdateGuardServicePort {
  constructor(private readonly repositoryId: string) {
    void repositoryId;
  }

  private onSymbolShouldBeReindexed: SymbolUpdateGuardCallback | undefined;

  registerOnSymbolShouldBeReindexed(callback: SymbolUpdateGuardCallback): void {
    this.onSymbolShouldBeReindexed = callback;
  }

  fileWasCreated(filePath: string): void {
    void filePath;
  }

  fileWasUpdated(filePath: string): void {
    void filePath;
  }

  fileWasDeleted(filePath: string): void {
    void filePath;
  }
}
