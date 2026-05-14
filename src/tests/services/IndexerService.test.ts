import { describe, expect, it } from "vitest";
import { IndexerService, indexSymbol } from "../../services/IndexerService.js";
import type { CreateSymbolInput } from "../../models/Symbol.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("IndexerService", () => {
  // ---------------------------------------------------------------------------
  // exposed APIs
  // ---------------------------------------------------------------------------

  describe("exposed APIs", () => {
    const service = new IndexerService();

    const makeSymbol = (): CreateSymbolInput => ({
      repositoryId: "repo-1",
      symbol: "Example.run",
      fileId: "file-1",
      hash: "symbol-hash-1",
      type: "function",
      visibility: "public",
      blurb: null,
      implementation: null,
      tags: [],
      embedding: null,
    });

    it("exposes a symbol indexing API", async () => {
      await expect(service.indexSymbol(makeSymbol())).rejects.toThrow(
        "Symbol indexing is not implemented yet",
      );
    });

    it("exposes module-level helper functions", async () => {
      await expect(indexSymbol(makeSymbol())).rejects.toThrow(
        "Symbol indexing is not implemented yet",
      );
    });
  });
});
