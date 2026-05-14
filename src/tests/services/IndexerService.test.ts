import { describe, expect, it, vi } from "vitest";
import {
  IndexerService,
  indexSymbol,
  type IndexSymbolInput,
} from "../../services/IndexerService.js";
import { createMockEmbeddingService } from "../fixtures/mockEmbeddingService.js";
import { createMockLLMService } from "../fixtures/mockLLMService.js";
import { createMockSymbolDBService } from "../fixtures/mockSymbolDBService.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(
  overrides: Partial<IndexSymbolInput> = {},
): IndexSymbolInput {
  return {
    repositoryId: "repo-1",
    symbol: "Example.run",
    fileId: "file-1",
    hash: "symbol-hash-1",
    type: "function",
    visibility: "public",
    body: "func run() -> Int { return 42 }",
    blurb: undefined,
    implementation: undefined,
    tags: [],
    embedding: undefined,
    ...overrides,
  };
}

function makeGeneratedSemantics() {
  return {
    blurb: "Returns the integer 42.",
    implementation: "Immediately returns the constant 42.",
    tags: ["constant return", "integer value"],
  };
}

function createService(llmOverrides = {}, dbOverrides = {}) {
  const llmService = createMockLLMService(llmOverrides);
  const embeddingService = createMockEmbeddingService();
  const symbolDBService = createMockSymbolDBService(dbOverrides);
  const service = new IndexerService({
    llmService,
    embeddingService,
    symbolDBService,
  });
  return { service, llmService, embeddingService, symbolDBService };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("IndexerService", () => {
  // ---------------------------------------------------------------------------
  // indexSymbol()
  // ---------------------------------------------------------------------------

  describe("indexSymbol()", () => {
    it("generates semantics and upserts when symbol has no existing blurb", async () => {
      const { service, llmService, embeddingService, symbolDBService } =
        createService();
      const semantics = makeGeneratedSemantics();
      const embedding = [0.1, 0.2, 0.3];

      llmService.promptForStructuredJson.mockResolvedValue(semantics);
      embeddingService.embed.mockResolvedValue(embedding);
      symbolDBService.upsertSymbol.mockResolvedValue({});

      const input = makeInput();
      await service.indexSymbol(input);

      expect(llmService.promptForStructuredJson).toHaveBeenCalledTimes(1);
      expect(embeddingService.embed).toHaveBeenCalledOnce();
      expect(embeddingService.embed).toHaveBeenCalledWith(
        expect.stringContaining("symbol: Example.run"),
      );
      expect(symbolDBService.upsertSymbol).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryId: "repo-1",
          symbol: "Example.run",
          blurb: semantics.blurb,
          implementation: semantics.implementation,
          tags: semantics.tags,
          embedding,
        }),
      );
    });

    it("merges semantic updates when existing blurb and implementation are present", async () => {
      const { service, llmService, embeddingService, symbolDBService } =
        createService();
      const embedding = [0.4, 0.5, 0.6];

      llmService.promptForStructuredJson.mockResolvedValueOnce({
        implementation: "Updated implementation.",
        tags: ["updated tag"],
      });
      embeddingService.embed.mockResolvedValue(embedding);
      symbolDBService.upsertSymbol.mockResolvedValue({});

      const input = makeInput({
        blurb: "Original blurb.",
        implementation: "Original implementation.",
        tags: ["original tag"],
      });
      await service.indexSymbol(input);

      expect(llmService.promptForStructuredJson).toHaveBeenCalledTimes(1);
      expect(llmService.promptForStructuredJson).toHaveBeenCalledWith(
        expect.stringContaining("fields that need to be updated"),
        expect.anything(),
      );
      expect(symbolDBService.upsertSymbol).toHaveBeenCalledWith(
        expect.objectContaining({
          blurb: "Original blurb.",
          implementation: "Updated implementation.",
          tags: ["updated tag"],
          embedding,
        }),
      );
    });

    it("uses the existing semantics when the update response is empty", async () => {
      const { service, llmService, embeddingService, symbolDBService } =
        createService();
      const embedding = [0.7, 0.8, 0.9];

      llmService.promptForStructuredJson.mockResolvedValueOnce({});
      embeddingService.embed.mockResolvedValue(embedding);
      symbolDBService.upsertSymbol.mockResolvedValue({});

      const input = makeInput({
        blurb: "Old blurb.",
        implementation: "Old implementation.",
        tags: ["old tag"],
      });
      await service.indexSymbol(input);

      expect(llmService.promptForStructuredJson).toHaveBeenCalledTimes(1);
      expect(symbolDBService.upsertSymbol).toHaveBeenCalledWith(
        expect.objectContaining({
          blurb: "Old blurb.",
          implementation: "Old implementation.",
          tags: ["old tag"],
          embedding,
        }),
      );
    });

    it("builds embedding text in the correct structured format", async () => {
      const { service, llmService, embeddingService, symbolDBService } =
        createService();
      const semantics = makeGeneratedSemantics();

      llmService.promptForStructuredJson.mockResolvedValue(semantics);
      embeddingService.embed.mockResolvedValue([0.1]);
      symbolDBService.upsertSymbol.mockResolvedValue({});

      await service.indexSymbol(makeInput());

      const embeddingArg: string = embeddingService.embed.mock
        .calls[0][0] as string;
      expect(embeddingArg).toContain("symbol: Example.run");
      expect(embeddingArg).toContain("type: function");
      expect(embeddingArg).toContain(`blurb: ${semantics.blurb}`);
      expect(embeddingArg).toContain(
        `implementation: ${semantics.implementation}`,
      );
    });

    it("propagates LLM errors and does not write a partial symbol", async () => {
      const { service, llmService, embeddingService, symbolDBService } =
        createService();
      llmService.promptForStructuredJson.mockRejectedValue(
        new Error("LLM unavailable"),
      );

      await expect(service.indexSymbol(makeInput())).rejects.toThrow(
        "LLM unavailable",
      );

      // If semantic generation fails, indexing must stop before embedding/upsert.
      expect(embeddingService.embed).not.toHaveBeenCalled();
      expect(symbolDBService.upsertSymbol).not.toHaveBeenCalled();
    });

    it("propagates embedding errors and does not write a partial symbol", async () => {
      const { service, llmService, embeddingService, symbolDBService } =
        createService();
      llmService.promptForStructuredJson.mockResolvedValue(
        makeGeneratedSemantics(),
      );
      embeddingService.embed.mockRejectedValue(
        new Error("embedding unavailable"),
      );

      await expect(service.indexSymbol(makeInput())).rejects.toThrow(
        "embedding unavailable",
      );

      expect(llmService.promptForStructuredJson).toHaveBeenCalledTimes(1);
      expect(embeddingService.embed).toHaveBeenCalledTimes(1);
      expect(symbolDBService.upsertSymbol).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // module-level helper
  // ---------------------------------------------------------------------------

  describe("indexSymbol() module export", () => {
    it("delegates to the default indexerService instance", async () => {
      const spy = vi
        .spyOn(
          (await import("../../services/IndexerService.js")).indexerService,
          "indexSymbol",
        )
        .mockResolvedValue(undefined);

      const input = makeInput();
      await indexSymbol(input);

      expect(spy).toHaveBeenCalledWith(input);
      spy.mockRestore();
    });
  });
});
