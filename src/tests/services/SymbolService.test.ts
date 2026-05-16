import { vi, describe, it, expect, beforeEach } from "vitest";

const mockedDeps = vi.hoisted(() => {
  return {
    embed: vi.fn(),
    semanticSearch: vi.fn(),
  };
});

vi.mock("../../services/EmbeddingService.js", () => ({
  embeddingService: {
    embed: mockedDeps.embed,
  },
}));

vi.mock("../../db/services/symbol.js", () => ({
  symbolDBService: {
    semanticSearch: mockedDeps.semanticSearch,
  },
}));

vi.mock("../../db/services/file.js", () => ({
  fileDBService: {
    upsertFile: vi.fn(),
  },
}));

import { SymbolService } from "../../services/SymbolService.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SymbolService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // query()
  // ---------------------------------------------------------------------------

  describe("query()", () => {
    it("embeds the query and delegates ranking to the DB semantic search", async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      const mockResults = [
        {
          id: "sym-1",
          repositoryId: "repo-1",
          symbol: "parseDate",
          fileId: "file-1",
          type: "function",
          visibility: "public",
          blurb: "Parses ISO dates",
          tags: ["date parsing"],
          score: 0.91,
        },
      ];

      mockedDeps.embed.mockResolvedValue(mockEmbedding);
      mockedDeps.semanticSearch.mockResolvedValue(mockResults);

      const results = await SymbolService.query(
        "  parse date text  ",
        5,
        "repo-1",
      );

      expect(mockedDeps.embed).toHaveBeenCalledWith("parse date text");
      expect(mockedDeps.semanticSearch).toHaveBeenCalledWith(
        mockEmbedding,
        5,
        "repo-1",
      );
      expect(results).toEqual(mockResults);
    });

    it("returns an empty list for blank query input", async () => {
      const results = await SymbolService.query("    ");

      expect(results).toEqual([]);
      expect(mockedDeps.embed).not.toHaveBeenCalled();
      expect(mockedDeps.semanticSearch).not.toHaveBeenCalled();
    });

    it("uses default limit when one is not provided", async () => {
      const mockEmbedding = [0.4, 0.5];
      mockedDeps.embed.mockResolvedValue(mockEmbedding);
      mockedDeps.semanticSearch.mockResolvedValue([]);

      await SymbolService.query("ranking intent");

      expect(mockedDeps.semanticSearch).toHaveBeenCalledWith(
        mockEmbedding,
        10,
        undefined,
      );
    });
  });
});
