import { describe, expect, it, vi } from "vitest";
import {
  EmbeddingService,
  EmbeddingServiceNotConfiguredError,
} from "../../services/EmbeddingService.js";
import type { EmbeddingProviderPort } from "../../services/llm/LLMProvider.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createConfiguredService(
  embedMock: EmbeddingProviderPort["embed"],
): EmbeddingService {
  const service = new EmbeddingService();
  service.configure({
    model: "llama3.1:8b",
    embeddingModel: "nomic-embed-text",
    provider: {
      embed: embedMock,
    },
  });
  return service;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EmbeddingService", () => {
  // ---------------------------------------------------------------------------
  // configure() / isConfigured()
  // ---------------------------------------------------------------------------

  describe("configure() / isConfigured()", () => {
    it("reports not configured before configure() is called", () => {
      const service = new EmbeddingService();
      expect(service.isConfigured()).toBe(false);
    });

    it("reports configured after configure() is called", () => {
      const service = createConfiguredService(vi.fn());
      expect(service.isConfigured()).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // embed()
  // ---------------------------------------------------------------------------

  describe("embed()", () => {
    it("delegates to the provider embed method with the configured embedding model", async () => {
      const embedMock = vi
        .fn<EmbeddingProviderPort["embed"]>()
        .mockResolvedValue([0.1, 0.2, 0.3]);
      const service = createConfiguredService(embedMock);

      const result = await service.embed("symbol: run\ntype: function");

      expect(result).toEqual([0.1, 0.2, 0.3]);
      expect(embedMock).toHaveBeenCalledWith(
        "symbol: run\ntype: function",
        "nomic-embed-text",
      );
    });

    it("defaults embedding model to the chat model when embeddingModel is not set", async () => {
      const embedMock = vi
        .fn<EmbeddingProviderPort["embed"]>()
        .mockResolvedValue([0.5]);
      const service = new EmbeddingService();
      service.configure({
        model: "llama3.1:8b",
        provider: { embed: embedMock },
      });

      await service.embed("some text");

      expect(embedMock).toHaveBeenCalledWith("some text", "llama3.1:8b");
    });

    it("throws EmbeddingServiceNotConfiguredError when not configured", async () => {
      const service = new EmbeddingService();
      await expect(service.embed("text")).rejects.toBeInstanceOf(
        EmbeddingServiceNotConfiguredError,
      );
    });
  });
});
