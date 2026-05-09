import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { TreeSitterService } from "../../../services/treesitter/TreeSitter.js";
import { swiftAdapter } from "../../../services/treesitter/SwiftAdapter.js";
import { pythonAdapter } from "../../../services/treesitter/PythonAdapter.js";
import { MockRepo } from "../../fixtures/mockRepo.js";
import type { ExtractedSymbol } from "../../../models/SymbolExtraction.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../../services/treesitter/extraction.js", () => ({
  extractSymbolsFromSource: vi.fn(),
}));

import { extractSymbolsFromSource } from "../../../services/treesitter/extraction.js";

const mockExtract = vi.mocked(extractSymbolsFromSource);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STUB_SYMBOLS: ExtractedSymbol[] = [
  {
    symbol: "MyClass",
    type: "class",
    visibility: "public",
    body: "class MyClass {}",
  },
];

function makeService(
  adapters = [swiftAdapter, pythonAdapter],
): TreeSitterService {
  return new TreeSitterService({ adapters });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TreeSitterService", () => {
  let repo: MockRepo;

  beforeEach(() => {
    repo = new MockRepo();
    mockExtract.mockReturnValue(STUB_SYMBOLS);
  });

  afterEach(() => {
    repo.cleanup();
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // constructor / registerAdapter()
  // ---------------------------------------------------------------------------

  describe("constructor()", () => {
    it("registers adapters provided in config", async () => {
      repo.writeFile("Greeter.swift", "public class Greeter {}");
      const filePath = repo.resolve("Greeter.swift");

      const service = makeService([swiftAdapter, pythonAdapter]);

      await expect(service.extractSymbols(filePath)).resolves.toBeDefined();
    });

    it("starts with no adapters when config is omitted", async () => {
      repo.writeFile("Greeter.swift", "public class Greeter {}");
      const filePath = repo.resolve("Greeter.swift");

      const service = new TreeSitterService();

      await expect(service.extractSymbols(filePath)).rejects.toThrow(
        "No Tree-sitter adapter registered",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // extractSymbols()
  // ---------------------------------------------------------------------------

  describe("extractSymbols()", () => {
    it("reads the file at the given path and passes its text to extractSymbolsFromSource", async () => {
      const content = "public class Greeter {}";
      repo.writeFile("Greeter.swift", content);
      const filePath = repo.resolve("Greeter.swift");

      const service = makeService();
      await service.extractSymbols(filePath);

      expect(mockExtract).toHaveBeenCalledOnce();
      const [passedSource] = mockExtract.mock.calls[0];
      expect(passedSource).toBe(content);
    });

    it("passes the resolved adapter to extractSymbolsFromSource", async () => {
      repo.writeFile("app.py", "def hello(): pass");
      const filePath = repo.resolve("app.py");

      const service = makeService();
      await service.extractSymbols(filePath);

      const [, passedAdapter] = mockExtract.mock.calls[0];
      expect(passedAdapter).toBe(pythonAdapter);
    });

    it("passes the swift adapter for .swift files", async () => {
      repo.writeFile("Greeter.swift", "public class Greeter {}");
      const filePath = repo.resolve("Greeter.swift");

      const service = makeService();
      await service.extractSymbols(filePath);

      const [, passedAdapter] = mockExtract.mock.calls[0];
      expect(passedAdapter).toBe(swiftAdapter);
    });

    it("returns the symbols produced by extractSymbolsFromSource", async () => {
      repo.writeFile("Greeter.swift", "public class Greeter {}");
      const filePath = repo.resolve("Greeter.swift");

      const service = makeService();
      const result = await service.extractSymbols(filePath);

      expect(result).toStrictEqual(STUB_SYMBOLS);
    });

    it("throws when the file extension has no registered adapter", async () => {
      repo.writeFile("readme.md", "# Hello");
      const filePath = repo.resolve("readme.md");

      const service = makeService();

      await expect(service.extractSymbols(filePath)).rejects.toThrow(
        "No Tree-sitter adapter registered",
      );
    });

    it("throws when the file extension is completely unknown", async () => {
      repo.writeFile("data.xyz", "something");
      const filePath = repo.resolve("data.xyz");

      const service = makeService();

      await expect(service.extractSymbols(filePath)).rejects.toThrow(
        "No Tree-sitter adapter registered",
      );
    });

    it("resolves .pyi files using the python adapter", async () => {
      repo.writeFile("stubs.pyi", "def hello() -> None: ...");
      const filePath = repo.resolve("stubs.pyi");

      const service = makeService();
      await service.extractSymbols(filePath);

      const [, passedAdapter] = mockExtract.mock.calls[0];
      expect(passedAdapter).toBe(pythonAdapter);
    });
  });
});
