import { describe, expect, it } from "vitest";
import {
  IndexerService,
  indexRepository,
  indexRepositoryFile,
  indexSymbol,
} from "../../services/IndexerService.js";
import type { Symbol } from "../../models/Symbol.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("IndexerService", () => {
  // ---------------------------------------------------------------------------
  // exposed APIs
  // ---------------------------------------------------------------------------

  describe("exposed APIs", () => {
    const service = new IndexerService();

    const makeSymbol = (): Symbol => ({
      id: "symbol-1",
      repositoryId: "repo-1",
      symbol: "Example.run",
      file: "src/example.ts",
      type: "function",
      visibility: "public",
      blurb: null,
      implementation: null,
      tags: [],
      embedding: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    it("exposes a repository file indexing API", async () => {
      await expect(
        service.indexRepositoryFile("repo-1", "src/example.ts"),
      ).rejects.toThrow("Repository file indexing is not implemented yet");
    });

    it("exposes a whole repository indexing API", async () => {
      await expect(service.indexRepository("repo-1")).rejects.toThrow(
        "Repository indexing is not implemented yet",
      );
    });

    it("exposes module-level helper functions", async () => {
      await expect(indexSymbol(makeSymbol())).rejects.toThrow(
        "Symbol indexing is not implemented yet",
      );
      await expect(
        indexRepositoryFile("repo-1", "src/example.ts"),
      ).rejects.toThrow("Repository file indexing is not implemented yet");
      await expect(indexRepository("repo-1")).rejects.toThrow(
        "Repository indexing is not implemented yet",
      );
    });
  });
});
