import { fileDBService } from "../db/services/file.js";
import type { FileDBServicePort } from "../db/services/file.js";
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
  FileUpdateTranslatorService,
  type FileUpdateTranslatorServiceConstructor,
  type FileUpdateTranslatorServicePort,
} from "./FileUpdateTranslatorService.js";
import type {
  Symbol,
  SymbolCoreFields,
  SymbolSemanticFields,
} from "../models/Symbol.js";

export type FileUpdateOperation = "created" | "updated" | "deleted";

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
  hasherService?: HasherServicePort;
  indexService?: IndexerServicePort;
  fileUpdateTranslatorServiceType?: FileUpdateTranslatorServiceConstructor;
  repositoryPathService?: RepositoryPathServicePort;
}

const defaultFileUpdateServiceConfig: Required<FileUpdateServiceConfig> = {
  debounceService,
  fileDBService,
  hasherService,
  indexService: indexerService,
  fileUpdateTranslatorServiceType: FileUpdateTranslatorService,
  repositoryPathService,
};

/**
 * Coordinates the full file-update pipeline: debounce a raw filesystem event,
 * derive the repository-relative path, persist the file record and hash, and
 * hand the update to the translator service so symbol reindexing or cleanup
 * can flow through to the index service.
 */
export class FileUpdateService implements FileUpdateServicePort {
  private readonly config: Required<FileUpdateServiceConfig>;

  private readonly debounceTimeMs = 5000;

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
      this.debounceTimeMs,
      async () => {
        await this.processFileUpdate(
          repositoryId,
          repositoryRootPath,
          repositoryRelativePath,
          operation,
        );
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
      case "created": {
        const fileHash = await this.config.hasherService.hashFile(fullPath);

        await this.config.fileDBService.createFile({
          repositoryId,
          path: repositoryRelativePath,
          hash: fileHash,
        });

        await this.getOrCreateFileUpdateTranslatorService(
          repositoryId,
        ).fileWasUpdated(repositoryRelativePath);
        return;
      }
      case "updated": {
        const existingFile =
          await this.config.fileDBService.getFileByRepositoryAndPath(
            repositoryId,
            repositoryRelativePath,
          );

        if (!existingFile) {
          return;
        }

        const fileHash = await this.config.hasherService.hashFile(fullPath);

        await this.config.fileDBService.updateFile(existingFile.id, {
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
      });

    fileUpdateTranslatorService.registerOnSymbolShouldBeReindexed(
      (
        symbolCoreFields: SymbolCoreFields,
        symbolSemanticFields: SymbolSemanticFields,
        body: string,
      ) => {
        void this.config.indexService.indexSymbol({
          ...symbolCoreFields,
          blurb: symbolSemanticFields.blurb ?? undefined,
          implementation: symbolSemanticFields.implementation ?? undefined,
          tags: symbolSemanticFields.tags,
          embedding: symbolSemanticFields.embedding ?? undefined,
          body,
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
