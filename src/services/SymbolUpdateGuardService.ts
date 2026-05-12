import { fileDBService } from "../db/services/file.js";
import { symbolDBService } from "../db/services/symbol.js";
import type { FileDBServicePort } from "../db/services/file.js";
import type { SymbolDBService } from "../db/services/symbol.js";
import { hasherService } from "./Hasher.js";
import type { HasherServicePort } from "./Hasher.js";
import type { Symbol } from "../models/Symbol.js";

export type SymbolUpdateGuardCallback = (symbol: Symbol) => void;

export type SymbolUpdateGuardServiceConstructor = new (
  repositoryId: string,
  hasherService?: HasherServicePort,
  fileDBService?: FileDBServicePort,
  symbolDBService?: SymbolDBService,
) => SymbolUpdateGuardServicePort;

export interface SymbolUpdateGuardServicePort {
  registerOnSymbolShouldBeReindexed(callback: SymbolUpdateGuardCallback): void;
  /**
   * Handles an updated file using a repository-relative path.
   */
  fileWasUpdated(repositoryRelativePath: string): void;
}

export class SymbolUpdateGuardService implements SymbolUpdateGuardServicePort {
  constructor(
    private readonly repositoryId: string,
    private readonly hasherService: HasherServicePort = hasherService,
    private readonly fileDBService: FileDBServicePort = fileDBService,
    private readonly symbolDBService: SymbolDBService = symbolDBService,
  ) {
    void repositoryId;
  }

  private onSymbolShouldBeReindexed: SymbolUpdateGuardCallback | undefined;

  registerOnSymbolShouldBeReindexed(callback: SymbolUpdateGuardCallback): void {
    this.onSymbolShouldBeReindexed = callback;
  }

  fileWasUpdated(repositoryRelativePath: string): void {
    void repositoryRelativePath;
  }
}
