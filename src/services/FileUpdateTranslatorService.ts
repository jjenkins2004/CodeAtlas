import { fileDBService } from "../db/services/file.js";
import { symbolDBService } from "../db/services/symbol.js";
import type { FileDBServicePort } from "../db/services/file.js";
import type { SymbolDBService } from "../db/services/symbol.js";
import { debounceService } from "./DebounceService.js";
import type { DebounceServicePort } from "./DebounceService.js";
import { hasherService } from "./Hasher.js";
import type { HasherServicePort } from "./Hasher.js";
import type { Symbol } from "../models/Symbol.js";

export type FileUpdateTranslatorCallback = (symbol: Symbol) => void;

export type FileUpdateTranslatorServiceConstructor = new (
  repositoryId: string,
  debounceService?: DebounceServicePort,
  hasherService?: HasherServicePort,
  fileDBService?: FileDBServicePort,
  symbolDBService?: SymbolDBService,
) => FileUpdateTranslatorServicePort;

/** Translates raw file updates into symbol actions like reindexing or deletion. */
export interface FileUpdateTranslatorServicePort {
  registerOnSymbolShouldBeReindexed(
    callback: FileUpdateTranslatorCallback,
  ): void;
  registerOnSymbolShouldBeDeleted(callback: FileUpdateTranslatorCallback): void;
  fileWasUpdated(repositoryRelativePath: string): void;
}

export class FileUpdateTranslatorService implements FileUpdateTranslatorServicePort {
  constructor(
    private readonly repositoryId: string,
    private readonly debounceService: DebounceServicePort = debounceService,
    private readonly hasherService: HasherServicePort = hasherService,
    private readonly fileDBService: FileDBServicePort = fileDBService,
    private readonly symbolDBService: SymbolDBService = symbolDBService,
  ) {
    void repositoryId;
  }

  private onSymbolShouldBeReindexed: FileUpdateTranslatorCallback | undefined;
  private onSymbolShouldBeDeleted: FileUpdateTranslatorCallback | undefined;

  registerOnSymbolShouldBeReindexed(
    callback: FileUpdateTranslatorCallback,
  ): void {
    this.onSymbolShouldBeReindexed = callback;
  }

  registerOnSymbolShouldBeDeleted(
    callback: FileUpdateTranslatorCallback,
  ): void {
    this.onSymbolShouldBeDeleted = callback;
  }

  fileWasUpdated(repositoryRelativePath: string): void {
    void repositoryRelativePath;
  }
}
