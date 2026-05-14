import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  Symbol,
  SymbolCoreFields,
  SymbolSemanticFields,
} from "../../models/Symbol.js";
import type { ExtractedSymbol } from "../../models/SymbolExtraction.js";
import {
  FileUpdateTranslatorService,
  type FileUpdateTranslatorServiceConfig,
} from "../../services/FileUpdateTranslatorService.js";
import type { TreeSitterService } from "../../services/treesitter/TreeSitter.js";
import { createMockDebounceService } from "../fixtures/mockDebounceService.js";
import { createMockFileDBService } from "../fixtures/mockFileDBService.js";
import { createMockHasherService } from "../fixtures/mockHasher.js";
import { createMockRepositoryPathService } from "../fixtures/mockRepositoryPathService.js";
import { createMockSymbolDBService } from "../fixtures/mockSymbolDBService.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const repositoryId = "repo-1";
const repositoryRelativePath = "src/example.ts";
const repositoryFullPath = "/repo/src/example.ts";

type MockTreeSitterService = {
  extractSymbols: ReturnType<typeof vi.fn>;
};

type TranslatorServiceDeps = ReturnType<typeof createTranslatorService>;

type FileUpdateScenario = {
  file?: ReturnType<typeof makeFile> | null;
  fileHash?: string;
  symbolHash?: string;
  extractedSymbols?: ExtractedSymbol[];
  existingSymbols?: Symbol[];
};

function createTranslatorService(
  overrides: Partial<FileUpdateTranslatorServiceConfig> = {},
): {
  debounceService: ReturnType<typeof createMockDebounceService>;
  fileDBService: ReturnType<typeof createMockFileDBService>;
  hasherService: ReturnType<typeof createMockHasherService>;
  repositoryPathService: ReturnType<typeof createMockRepositoryPathService>;
  symbolDBService: ReturnType<typeof createMockSymbolDBService>;
  treeSitterService: MockTreeSitterService;
  service: FileUpdateTranslatorService;
} {
  const debounceService = createMockDebounceService();
  const fileDBService = createMockFileDBService();
  const hasherService = createMockHasherService();
  const repositoryPathService = createMockRepositoryPathService();
  const symbolDBService = createMockSymbolDBService();
  const treeSitterService: MockTreeSitterService = {
    extractSymbols: vi.fn(),
  };

  const service = new FileUpdateTranslatorService({
    repositoryId,
    debounceService,
    hasherService,
    fileDBService,
    symbolDBService,
    repositoryPathService,
    treeSitterService: treeSitterService as unknown as TreeSitterService,
    ...overrides,
  });

  return {
    debounceService,
    fileDBService,
    hasherService,
    repositoryPathService,
    symbolDBService,
    treeSitterService,
    service,
  };
}

function makeFile() {
  return {
    id: "file-1",
    repositoryId,
    path: repositoryRelativePath,
    hash: "file-hash-db",
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  };
}

function makeSymbol(overrides: Partial<Symbol> = {}): Symbol {
  return {
    id: "symbol-1",
    repositoryId,
    symbol: "Example.run",
    fileId: "file-1",
    hash: "symbol-hash-db",
    type: "function",
    visibility: "public",
    blurb: null,
    implementation: null,
    tags: [],
    embedding: null,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeExtractedSymbol(
  overrides: Partial<ExtractedSymbol> = {},
): ExtractedSymbol {
  return {
    symbol: "Example.run",
    type: "function",
    visibility: "public",
    body: "func run() {}",
    ...overrides,
  };
}

function makeSymbolCoreFields(
  overrides: Partial<SymbolCoreFields> = {},
): SymbolCoreFields {
  return {
    repositoryId,
    symbol: "Example.run",
    fileId: "file-1",
    hash: "symbol-hash-new",
    type: "function",
    visibility: "public",
    ...overrides,
  };
}

function makeSymbolSemanticFields(
  overrides: Partial<SymbolSemanticFields> = {},
): SymbolSemanticFields {
  return {
    blurb: null,
    implementation: null,
    tags: [],
    embedding: null,
    ...overrides,
  };
}

function configureFileUpdateScenario(
  deps: TranslatorServiceDeps,
  scenario: FileUpdateScenario = {},
): void {
  const file = scenario.file === undefined ? makeFile() : scenario.file;

  deps.repositoryPathService.toRepositoryFullPathByRepositoryId.mockResolvedValue(
    repositoryFullPath,
  );
  deps.fileDBService.getFileByRepositoryAndPath.mockResolvedValue(file);

  if (!file) {
    return;
  }

  deps.hasherService.hashFile.mockResolvedValue(
    scenario.fileHash ?? "file-hash-new",
  );
  deps.hasherService.hashCodeBlock.mockReturnValue(
    scenario.symbolHash ?? "symbol-hash-new",
  );
  deps.treeSitterService.extractSymbols.mockResolvedValue(
    scenario.extractedSymbols ?? [makeExtractedSymbol()],
  );
  deps.symbolDBService.listSymbolsByRepositoryFile.mockResolvedValue(
    scenario.existingSymbols ?? [],
  );
}

function runDebounceCallback(deps: TranslatorServiceDeps): void {
  const callback = deps.debounceService.debounce.mock.calls[0]?.[2] as
    | (() => void)
    | undefined;

  callback?.();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FileUpdateTranslatorService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // fileWasUpdated()
  // ---------------------------------------------------------------------------

  describe("fileWasUpdated()", () => {
    it("registers and invokes the reindex callback with split payloads", async () => {
      const deps = createTranslatorService();
      const onReindex = vi.fn();

      deps.service.registerOnSymbolShouldBeReindexed(onReindex);
      configureFileUpdateScenario(deps, {
        extractedSymbols: [
          makeExtractedSymbol({ body: "func run() { return 1 }" }),
        ],
      });

      await deps.service.fileWasUpdated(repositoryRelativePath);

      expect(
        deps.repositoryPathService.toRepositoryFullPathByRepositoryId,
      ).toHaveBeenCalledWith(repositoryId, repositoryRelativePath);
      expect(
        deps.fileDBService.getFileByRepositoryAndPath,
      ).toHaveBeenCalledWith(repositoryId, repositoryRelativePath);
      expect(deps.treeSitterService.extractSymbols).toHaveBeenCalledWith(
        repositoryFullPath,
      );
      expect(
        deps.symbolDBService.listSymbolsByRepositoryFile,
      ).toHaveBeenCalledWith(repositoryId, "file-1");

      runDebounceCallback(deps);

      expect(onReindex).toHaveBeenCalledWith(
        makeSymbolCoreFields(),
        makeSymbolSemanticFields(),
        "func run() { return 1 }",
      );
    });

    it("invokes the delete callback for missing symbols", async () => {
      const deps = createTranslatorService();
      const onDelete = vi.fn();

      deps.service.registerOnSymbolShouldBeDeleted(onDelete);
      configureFileUpdateScenario(deps, {
        extractedSymbols: [],
        existingSymbols: [makeSymbol()],
      });

      await deps.service.fileWasUpdated(repositoryRelativePath);

      expect(onDelete).toHaveBeenCalledWith(makeSymbol());
    });

    it("returns early when the tracked file is missing", async () => {
      const deps = createTranslatorService();

      configureFileUpdateScenario(deps, { file: null });

      await deps.service.fileWasUpdated(repositoryRelativePath);

      expect(deps.treeSitterService.extractSymbols).not.toHaveBeenCalled();
      expect(
        deps.symbolDBService.listSymbolsByRepositoryFile,
      ).not.toHaveBeenCalled();
      expect(deps.debounceService.debounce).not.toHaveBeenCalled();
      expect(deps.debounceService.remove).not.toHaveBeenCalled();
    });

    it("still evaluates symbols when file hash matches the database", async () => {
      const deps = createTranslatorService();

      configureFileUpdateScenario(deps, { fileHash: "file-hash-db" });

      await deps.service.fileWasUpdated(repositoryRelativePath);

      expect(deps.treeSitterService.extractSymbols).toHaveBeenCalledWith(
        repositoryFullPath,
      );
      expect(
        deps.symbolDBService.listSymbolsByRepositoryFile,
      ).toHaveBeenCalledWith(repositoryId, "file-1");
    });

    it("removes pending work when the symbol hash matches", async () => {
      const deps = createTranslatorService();

      configureFileUpdateScenario(deps, {
        symbolHash: "symbol-hash-db",
        existingSymbols: [makeSymbol()],
      });

      await deps.service.fileWasUpdated(repositoryRelativePath);

      expect(deps.debounceService.remove).toHaveBeenCalledWith("Example.run");
      expect(deps.debounceService.debounce).not.toHaveBeenCalled();
    });

    it("debounces changed symbols for reindexing", async () => {
      const deps = createTranslatorService();
      const onReindex = vi.fn();

      deps.service.registerOnSymbolShouldBeReindexed(onReindex);
      configureFileUpdateScenario(deps, {
        extractedSymbols: [
          makeExtractedSymbol({ body: "func run() { return 1 }" }),
        ],
      });

      await deps.service.fileWasUpdated(repositoryRelativePath);

      expect(deps.debounceService.debounce).toHaveBeenCalledWith(
        "Example.run",
        20000,
        expect.any(Function),
      );

      runDebounceCallback(deps);

      expect(onReindex).toHaveBeenCalledWith(
        makeSymbolCoreFields(),
        makeSymbolSemanticFields(),
        "func run() { return 1 }",
      );
    });
  });
});
