import { fileDBService } from "../db/services/file.js";
import type { FileDBServicePort } from "../db/services/file.js";
import { symbolDBService } from "../db/services/symbol.js";
import type { SymbolDBService } from "../db/services/symbol.js";
import { indexerService } from "./IndexerService.js";
import type { IndexerServicePort } from "./IndexerService.js";
import { debounceService } from "./util/DebounceService.js";
import type { DebounceServicePort } from "./util/DebounceService.js";
import { hasherService } from "./util/Hasher.js";
import type { HasherServicePort } from "./util/Hasher.js";
import {
  repositoryPathService,
  type RepositoryPathServicePort,
} from "./util/RepositoryPathService.js";
import {
  treeSitterService,
  type TreeSitterService,
} from "./treesitter/TreeSitter.js";
import {
  FileUpdateTranslatorService,
  type FileUpdateTranslatorServiceConstructor,
  type FileUpdateTranslatorServicePort,
} from "./FileUpdateTranslatorService.js";
import type {
  Symbol,
  SymbolCoreFields,
  SymbolSemanticFields,
} from "../models/Symbol.js";

export type FileUpdateOperation = "changed" | "deleted";

export interface FileUpdateServicePort {
  handleFileUpdate(
    repositoryId: string,
    repositoryRootPath: string,
    repositoryRelativePath: string,
    operation: FileUpdateOperation,
  ): void;

  removeRepository(repositoryId: string): void;
}

export interface FileUpdateServiceConfig {
  debounceService?: DebounceServicePort;
  fileDBService?: FileDBServicePort;
  symbolDBService?: SymbolDBService;
  hasherService?: HasherServicePort;
  indexService?: IndexerServicePort;
  fileUpdateTranslatorServiceType?: FileUpdateTranslatorServiceConstructor;
  repositoryPathService?: RepositoryPathServicePort;
  treeSitterService?: TreeSitterService;
  /** Debounce window in ms applied per file path before processing. Defaults to 5 000. */
  debounceMs?: number;
  /** Debounce window in ms applied per symbol name inside the translator. Defaults to 20 000. */
  symbolDebounceMs?: number;
  /** Debounce service instance used inside each translator. Defaults to the shared singleton. */
  translatorDebounceService?: DebounceServicePort;
}

const defaultFileUpdateServiceConfig: Required<FileUpdateServiceConfig> = {
  debounceService,
  fileDBService,
  symbolDBService,
  hasherService,
  indexService: indexerService,
  fileUpdateTranslatorServiceType: FileUpdateTranslatorService,
  repositoryPathService,
  treeSitterService,
  debounceMs: 5000,
  symbolDebounceMs: 20000,
  translatorDebounceService: debounceService,
};

/**
 * Coordinates the full file-update pipeline: debounce a raw filesystem event,
 * derive the repository-relative path, persist the file record and hash, and
 * hand the update to the translator service so symbol reindexing or cleanup
 * can flow through to the index service.
 */
export class FileUpdateService implements FileUpdateServicePort {
  private readonly config: Required<FileUpdateServiceConfig>;

  private readonly fileUpdateTranslatorServices = new Map<
    string,
    FileUpdateTranslatorServicePort
  >();

  constructor(config: FileUpdateServiceConfig = {}) {
    this.config = {
      ...defaultFileUpdateServiceConfig,
      ...config,
    };
  }

  handleFileUpdate(
    repositoryId: string,
    repositoryRootPath: string,
    repositoryRelativePath: string,
    operation: FileUpdateOperation,
  ): void {
    this.config.debounceService.debounce(
      `${repositoryId}:${repositoryRelativePath}`,
      this.config.debounceMs,
      async () => {
        try {
          await this.processFileUpdate(
            repositoryId,
            repositoryRootPath,
            repositoryRelativePath,
            operation,
          );
        } catch (error) {
          console.warn(
            `Failed to process file update ${repositoryId}:${repositoryRelativePath}`,
            error,
          );
        }
      },
    );
  }

  removeRepository(repositoryId: string): void {
    this.fileUpdateTranslatorServices.delete(repositoryId);
  }

  private async processFileUpdate(
    repositoryId: string,
    repositoryRootPath: string,
    repositoryRelativePath: string,
    operation: FileUpdateOperation,
  ): Promise<void> {
    const fullPath = this.config.repositoryPathService.toRepositoryFullPath(
      repositoryRootPath,
      repositoryRelativePath,
    );

    switch (operation) {
      case "changed": {
        const existingFile =
          await this.config.fileDBService.getFileByRepositoryAndPath(
            repositoryId,
            repositoryRelativePath,
          );

        const fileHash = await this.config.hasherService.hashFile(fullPath);

        if (existingFile?.hash === fileHash) {
          return;
        }

        await this.config.fileDBService.upsertFile({
          repositoryId,
          path: repositoryRelativePath,
          hash: fileHash,
        });

        await this.getOrCreateFileUpdateTranslatorService(
          repositoryId,
        ).fileWasUpdated(repositoryRelativePath);
        return;
      }
      case "deleted": {
        const existingFile =
          await this.config.fileDBService.getFileByRepositoryAndPath(
            repositoryId,
            repositoryRelativePath,
          );

        if (!existingFile) {
          return;
        }

        await this.config.fileDBService.removeFile(existingFile.id);
      }
    }
  }

  private getOrCreateFileUpdateTranslatorService(
    repositoryId: string,
  ): FileUpdateTranslatorServicePort {
    const existingFileUpdateTranslatorService =
      this.fileUpdateTranslatorServices.get(repositoryId);

    if (existingFileUpdateTranslatorService) {
      return existingFileUpdateTranslatorService;
    }

    const fileUpdateTranslatorService =
      new this.config.fileUpdateTranslatorServiceType({
        repositoryId,
        hasherService: this.config.hasherService,
        fileDBService: this.config.fileDBService,
        symbolDBService: this.config.symbolDBService,
        repositoryPathService: this.config.repositoryPathService,
        treeSitterService: this.config.treeSitterService,
        symbolDebounceMs: this.config.symbolDebounceMs,
        debounceService: this.config.translatorDebounceService,
      });

    fileUpdateTranslatorService.registerOnSymbolShouldBeReindexed(
      (
        symbolCoreFields: SymbolCoreFields,
        symbolSemanticFields: SymbolSemanticFields,
        body: string,
      ) => {
        void Promise.resolve(
          this.config.indexService.indexSymbol({
            ...symbolCoreFields,
            blurb: symbolSemanticFields.blurb ?? undefined,
            implementation: symbolSemanticFields.implementation ?? undefined,
            tags: symbolSemanticFields.tags,
            embedding: symbolSemanticFields.embedding ?? undefined,
            body,
          }),
        )
          .catch((error) => {
            console.warn(
              `Failed to index symbol ${symbolCoreFields.repositoryId}:${symbolCoreFields.symbol}`,
              error,
            );
          });
      },
    );

    fileUpdateTranslatorService.registerOnSymbolShouldBeDeleted(() => {
      return;
    });

    this.fileUpdateTranslatorServices.set(
      repositoryId,
      fileUpdateTranslatorService,
    );

    return fileUpdateTranslatorService;
  }
}

export const fileUpdateService = new FileUpdateService();
