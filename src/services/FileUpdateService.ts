import path from "path";
import { fileDBService } from "../db/services/file.js";
import type { FileDBServicePort } from "../db/services/file.js";
import { indexerService } from "./IndexerService.js";
import type { IndexerServicePort } from "./IndexerService.js";
import { debounceService } from "./DebounceService.js";
import type { DebounceServicePort } from "./DebounceService.js";
import { hasherService } from "./Hasher.js";
import type { HasherServicePort } from "./Hasher.js";
import {
  SymbolUpdateGuardService,
  type SymbolUpdateGuardServiceConstructor,
  type SymbolUpdateGuardServicePort,
} from "./SymbolUpdateGuardService.js";
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
  symbolUpdateGuardServiceType?: SymbolUpdateGuardServiceConstructor;
}

const defaultFileUpdateServiceConfig: Required<FileUpdateServiceConfig> = {
  debounceService,
  fileDBService,
  hasherService,
  indexService: indexerService,
  symbolUpdateGuardServiceType: SymbolUpdateGuardService,
};

export class FileUpdateService implements FileUpdateServicePort {
  private readonly config: Required<FileUpdateServiceConfig>;

  private readonly debounceTimeMs = 5000;

  private readonly symbolUpdateGuardServices = new Map<
    string,
    SymbolUpdateGuardServicePort
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
    this.symbolUpdateGuardServices.delete(repositoryId);
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

        this.getOrCreateSymbolUpdateGuardService(repositoryId).fileWasUpdated(
          repositoryRelativePath,
        );
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

        this.getOrCreateSymbolUpdateGuardService(repositoryId).fileWasUpdated(
          repositoryRelativePath,
        );
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

  private getOrCreateSymbolUpdateGuardService(
    repositoryId: string,
  ): SymbolUpdateGuardServicePort {
    const existingSymbolUpdateGuardService =
      this.symbolUpdateGuardServices.get(repositoryId);

    if (existingSymbolUpdateGuardService) {
      return existingSymbolUpdateGuardService;
    }

    const symbolUpdateGuardService =
      new this.config.symbolUpdateGuardServiceType(
        repositoryId,
        this.config.debounceService,
      );

    symbolUpdateGuardService.registerOnSymbolShouldBeReindexed(
      (symbol: Symbol) => {
        void this.config.indexService.indexSymbol(symbol);
      },
    );

    this.symbolUpdateGuardServices.set(repositoryId, symbolUpdateGuardService);

    return symbolUpdateGuardService;
  }

  private toRepositoryRelativePath(
    repositoryRootPath: string,
    filePath: string,
  ): string {
    return path.relative(repositoryRootPath, filePath);
  }
}

export const fileUpdateService = new FileUpdateService();
