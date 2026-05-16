import { fileDBService } from "../db/services/file.js";
import { symbolDBService } from "../db/services/symbol.js";
import type { FileDBServicePort } from "../db/services/file.js";
import type { SymbolDBService } from "../db/services/symbol.js";
import type { ExtractedSymbol } from "../models/SymbolExtraction.js";
import {
  treeSitterService,
  type TreeSitterService,
} from "./treesitter/TreeSitter.js";
import { debounceService } from "./util/DebounceService.js";
import type { DebounceServicePort } from "./util/DebounceService.js";
import { hasherService } from "./util/Hasher.js";
import type { HasherServicePort } from "./util/Hasher.js";
import type {
  Symbol,
  SymbolCoreFields,
  SymbolSemanticFields,
} from "../models/Symbol.js";
import {
  repositoryPathService,
  type RepositoryPathServicePort,
} from "./util/RepositoryPathService.js";
import { createLogger } from "./util/Logger.js";

const logger = createLogger({ component: "file-update-translator" });

export type FileUpdateTranslatorCallback = (
  symbolCoreFields: SymbolCoreFields,
  symbolSemanticFields: SymbolSemanticFields,
  body: string,
) => void;

export type FileUpdateTranslatorDeleteCallback = (symbol: Symbol) => void;

export interface FileUpdateTranslatorServiceConfig {
  repositoryId: string;
  debounceService?: DebounceServicePort;
  hasherService?: HasherServicePort;
  fileDBService?: FileDBServicePort;
  symbolDBService?: SymbolDBService;
  repositoryPathService?: RepositoryPathServicePort;
  treeSitterService?: TreeSitterService;
  /** Debounce window in ms applied per symbol before triggering reindex. Defaults to 20 000. */
  symbolDebounceMs?: number;
}

export type FileUpdateTranslatorServiceConstructor = new (
  config: FileUpdateTranslatorServiceConfig,
) => FileUpdateTranslatorServicePort;

const defaultFileUpdateTranslatorServiceConfig: Required<
  Omit<FileUpdateTranslatorServiceConfig, "repositoryId">
> = {
  debounceService,
  hasherService,
  fileDBService,
  symbolDBService,
  repositoryPathService,
  treeSitterService,
  symbolDebounceMs: 20000,
};

/** Translates raw file updates into symbol actions like reindexing or deletion. */
export interface FileUpdateTranslatorServicePort {
  registerOnSymbolShouldBeReindexed(
    callback: FileUpdateTranslatorCallback,
  ): void;
  registerOnSymbolShouldBeDeleted(
    callback: FileUpdateTranslatorDeleteCallback,
  ): void;
  fileWasUpdated(repositoryRelativePath: string): Promise<void>;
}

export class FileUpdateTranslatorService implements FileUpdateTranslatorServicePort {
  private readonly config: Required<
    Omit<FileUpdateTranslatorServiceConfig, "repositoryId">
  > & {
    repositoryId: string;
  };

  constructor(config: FileUpdateTranslatorServiceConfig) {
    this.config = {
      ...defaultFileUpdateTranslatorServiceConfig,
      ...config,
    };
  }

  private onSymbolShouldBeReindexed: FileUpdateTranslatorCallback | undefined;
  private onSymbolShouldBeDeleted:
    | FileUpdateTranslatorDeleteCallback
    | undefined;

  registerOnSymbolShouldBeReindexed(
    callback: FileUpdateTranslatorCallback,
  ): void {
    this.onSymbolShouldBeReindexed = callback;
  }

  registerOnSymbolShouldBeDeleted(
    callback: FileUpdateTranslatorDeleteCallback,
  ): void {
    this.onSymbolShouldBeDeleted = callback;
  }

  async fileWasUpdated(repositoryRelativePath: string): Promise<void> {
    logger.debug(
      {
        repositoryId: this.config.repositoryId,
        repositoryRelativePath,
      },
      "Translating file update into symbol actions",
    );

    const fullPath =
      await this.config.repositoryPathService.toRepositoryFullPathByRepositoryId(
        this.config.repositoryId,
        repositoryRelativePath,
      );

    const file = await this.config.fileDBService.getFileByRepositoryAndPath(
      this.config.repositoryId,
      repositoryRelativePath,
    );

    if (!file) {
      logger.debug(
        {
          repositoryId: this.config.repositoryId,
          repositoryRelativePath,
        },
        "Skipping file update because no file record exists",
      );
      return;
    }

    let symbols: ExtractedSymbol[];

    try {
      symbols = await this.config.treeSitterService.extractSymbols(fullPath);
    } catch (error) {
      if (this.isUnsupportedFileError(error)) {
        logger.debug(
          {
            repositoryId: this.config.repositoryId,
            repositoryRelativePath,
          },
          "Skipping unsupported file type",
        );
        return;
      }

      throw error;
    }

    const existingSymbols =
      await this.config.symbolDBService.listSymbolsByRepositoryFile(
        this.config.repositoryId,
        file.id,
      );
    const existingSymbolsByName = new Map(
      existingSymbols.map((symbol) => [symbol.symbol, symbol]),
    );
    const extractedSymbolNames = new Set(
      symbols.map((symbol) => symbol.symbol),
    );

    logger.debug(
      {
        repositoryId: this.config.repositoryId,
        repositoryRelativePath,
        extractedSymbolCount: symbols.length,
        existingSymbolCount: existingSymbols.length,
      },
      "Compared extracted symbols with indexed symbols",
    );

    for (const symbol of symbols) {
      await this.determineSymbolIndexing(
        symbol,
        existingSymbolsByName.get(symbol.symbol),
        file,
      );
    }

    for (const existingSymbol of existingSymbols) {
      if (!extractedSymbolNames.has(existingSymbol.symbol)) {
        logger.debug(
          {
            repositoryId: this.config.repositoryId,
            repositoryRelativePath,
            symbol: existingSymbol.symbol,
          },
          "Indexed symbol no longer exists in file",
        );
        this.onSymbolShouldBeDeleted?.(existingSymbol);
      }
    }
  }

  private isUnsupportedFileError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    return error.message.startsWith(
      "No Tree-sitter adapter registered for file:",
    );
  }

  private async determineSymbolIndexing(
    extractedSymbol: ExtractedSymbol,
    existingSymbol: Symbol | undefined,
    file: NonNullable<
      Awaited<ReturnType<FileDBServicePort["getFileByRepositoryAndPath"]>>
    >,
  ): Promise<void> {
    const extractedSymbolHash = this.config.hasherService.hashCodeBlock(
      extractedSymbol.body,
    );

    if (existingSymbol?.hash === extractedSymbolHash) {
      this.config.debounceService.remove(extractedSymbol.symbol);

      logger.debug(
        {
          repositoryId: this.config.repositoryId,
          symbol: extractedSymbol.symbol,
        },
        "Skipping unchanged symbol",
      );

      return;
    }

    const symbolCoreFields: SymbolCoreFields = {
      repositoryId: this.config.repositoryId,
      symbol: extractedSymbol.symbol,
      fileId: file.id,
      hash: extractedSymbolHash,
      type: extractedSymbol.type,
      visibility: extractedSymbol.visibility,
    };

    const symbolSemanticFields: SymbolSemanticFields = existingSymbol
      ? {
          blurb: existingSymbol.blurb,
          implementation: existingSymbol.implementation,
          tags: existingSymbol.tags,
          embedding: existingSymbol.embedding,
        }
      : {
          blurb: null,
          implementation: null,
          tags: [],
          embedding: null,
        };

    this.config.debounceService.debounce(
      symbolCoreFields.symbol,
      this.config.symbolDebounceMs,
      () => {
        logger.debug(
          {
            repositoryId: this.config.repositoryId,
            symbol: symbolCoreFields.symbol,
            type: symbolCoreFields.type,
            visibility: symbolCoreFields.visibility,
          },
          existingSymbol
            ? "Scheduling semantic refresh for changed symbol"
            : "Scheduling index for new symbol",
        );

        this.onSymbolShouldBeReindexed?.(
          symbolCoreFields,
          symbolSemanticFields,
          extractedSymbol.body,
        );
      },
    );
  }
}
