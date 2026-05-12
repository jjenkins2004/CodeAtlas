import { fileDBService } from "../db/services/file.js";
import { symbolDBService } from "../db/services/symbol.js";
import type { FileDBServicePort } from "../db/services/file.js";
import type { SymbolDBService } from "../db/services/symbol.js";
import { debounceService } from "./util/DebounceService.js";
import type { DebounceServicePort } from "./util/DebounceService.js";
import { hasherService } from "./util/Hasher.js";
import type { HasherServicePort } from "./util/Hasher.js";
import type { Symbol } from "../models/Symbol.js";

export type SymbolUpdateGuardCallback = (symbol: Symbol) => void;

export type SymbolUpdateGuardServiceConstructor = new (
  repositoryId: string,
  debounceService?: DebounceServicePort,
  hasherService?: HasherServicePort,
  fileDBService?: FileDBServicePort,
  symbolDBService?: SymbolDBService,
) => SymbolUpdateGuardServicePort;

/** Translates raw file updates into symbol actions like reindexing or deletion. */
export interface SymbolUpdateGuardServicePort {
  registerOnSymbolShouldBeReindexed(callback: SymbolUpdateGuardCallback): void;
  registerOnSymbolShouldBeDeleted(callback: SymbolUpdateGuardCallback): void;
  fileWasUpdated(repositoryRelativePath: string): void;
}

export class SymbolUpdateGuardService implements SymbolUpdateGuardServicePort {
  constructor(
    private readonly repositoryId: string,
    private readonly debounceService: DebounceServicePort = debounceService,
    private readonly hasherService: HasherServicePort = hasherService,
    private readonly fileDBService: FileDBServicePort = fileDBService,
    private readonly symbolDBService: SymbolDBService = symbolDBService,
  ) {
    void repositoryId;
  }

  private onSymbolShouldBeReindexed: SymbolUpdateGuardCallback | undefined;
  private onSymbolShouldBeDeleted: SymbolUpdateGuardCallback | undefined;

  registerOnSymbolShouldBeReindexed(callback: SymbolUpdateGuardCallback): void {
    this.onSymbolShouldBeReindexed = callback;
  }

  registerOnSymbolShouldBeDeleted(callback: SymbolUpdateGuardCallback): void {
    this.onSymbolShouldBeDeleted = callback;
  }

  fileWasUpdated(repositoryRelativePath: string): void {
    void repositoryRelativePath;
  }
}
