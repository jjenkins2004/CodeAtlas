import path from "path";
import { fileDBService } from "../db/services/file.js";
import type { FileDBServicePort } from "../db/services/file.js";
import { indexerService } from "./IndexerService.js";
import type { IndexerServicePort } from "./IndexerService.js";
import { debounceService } from "./util/DebounceService.js";
import type { DebounceServicePort } from "./util/DebounceService.js";
import { hasherService } from "./util/Hasher.js";
import type { HasherServicePort } from "./util/Hasher.js";
import {
  FileUpdateTranslatorService,
  type FileUpdateTranslatorServiceConstructor,
  type FileUpdateTranslatorServicePort,
} from "./FileUpdateTranslatorService.js";
import type { Symbol } from "../models/Symbol.js";

export type FileUpdateOperation = "created" | "updated" | "deleted";

export interface FileUpdateServicePort {
  handleFileUpdate(
    repositoryId: string,
    repositoryRootPath: string,
    filePath: string,
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
}

const defaultFileUpdateServiceConfig: Required<FileUpdateServiceConfig> = {
  debounceService,
  fileDBService,
  hasherService,
  indexService: indexerService,
  fileUpdateTranslatorServiceType: FileUpdateTranslatorService,
};

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
    filePath: string,
    operation: FileUpdateOperation,
  ): void {
    this.config.debounceService.debounce(
      `${repositoryId}:${filePath}`,
      filePath,
      this.debounceTimeMs,
      async () => {
        await this.processFileUpdate(
          repositoryId,
          repositoryRootPath,
          filePath,
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
    filePath: string,
    operation: FileUpdateOperation,
  ): Promise<void> {
    const repositoryRelativePath = this.toRepositoryRelativePath(
      repositoryRootPath,
      filePath,
    );

    switch (operation) {
      case "created": {
        const fileHash = await this.config.hasherService.hashFile(filePath);

        await this.config.fileDBService.createFile({
          repositoryId,
          path: repositoryRelativePath,
          hash: fileHash,
        });

        this.getOrCreateFileUpdateTranslatorService(
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

        const fileHash = await this.config.hasherService.hashFile(filePath);

        await this.config.fileDBService.updateFile(existingFile.id, {
          hash: fileHash,
        });

        this.getOrCreateFileUpdateTranslatorService(
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
      new this.config.fileUpdateTranslatorServiceType(
        repositoryId,
        this.config.debounceService,
      );

    fileUpdateTranslatorService.registerOnSymbolShouldBeReindexed(
      (symbol: Symbol) => {
        void this.config.indexService.indexSymbol(symbol);
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

  private toRepositoryRelativePath(
    repositoryRootPath: string,
    filePath: string,
  ): string {
    return path.relative(repositoryRootPath, filePath);
  }
}

export const fileUpdateService = new FileUpdateService();
