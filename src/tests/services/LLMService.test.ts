import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  LLMService,
  LLMServiceNotConfiguredError,
  LLMServiceResponseFormatError,
  LLMServiceValidationError,
} from "../../services/LLMService.js";
import type { LLMProviderPort } from "../../services/llm/LLMProvider.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createConfiguredService(
  generateMock: LLMProviderPort["generate"],
): LLMService {
  const service = new LLMService();
  service.configure({
    model: "llama3.1:8b",
    provider: {
      generate: generateMock,
    },
  });
  return service;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LLMService", () => {
  // ---------------------------------------------------------------------------
  // configure() / isConfigured()
  // ---------------------------------------------------------------------------

  describe("configure() / isConfigured()", () => {
    it("reports not configured before configure() is called", () => {
      const service = new LLMService();
      expect(service.isConfigured()).toBe(false);
    });

    it("reports configured after configure() is called", () => {
      const service = createConfiguredService(vi.fn());
      expect(service.isConfigured()).toBe(true);
    });

    it("throws LLMServiceNotConfiguredError when used without configuring", async () => {
      const service = new LLMService();
      await expect(
        service.promptForStructuredJson("test", z.object({ ok: z.boolean() })),
      ).rejects.toBeInstanceOf(LLMServiceNotConfiguredError);
    });
  });

  // ---------------------------------------------------------------------------
  // promptForStructuredJson()
  // ---------------------------------------------------------------------------

  describe("promptForStructuredJson()", () => {
    it("returns typed JSON when provider responds with valid content", async () => {
      const generateMock = vi
        .fn<LLMProviderPort["generate"]>()
        .mockResolvedValue(
          '{"blurb":"Summarizes a symbol","tags":["indexing","summary"]}',
        );
      const service = createConfiguredService(generateMock);
      const schema = z.object({
        blurb: z.string(),
        tags: z.array(z.string()),
      });

      const result = await service.promptForStructuredJson(
        "Summarize this symbol.",
        schema,
      );

      expect(result).toEqual({
        blurb: "Summarizes a symbol",
        tags: ["indexing", "summary"],
      });

      expect(generateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "llama3.1:8b",
          temperature: 0.1,
        }),
      );

      expect(generateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: expect.stringContaining("CodeAtlas"),
          userPrompt: expect.stringContaining(
            "Return a single JSON object response.",
          ),
        }),
      );
    });

    it("bubbles provider failures", async () => {
      const generateMock = vi
        .fn<LLMProviderPort["generate"]>()
        .mockRejectedValue(new Error("connection refused"));
      const service = createConfiguredService(generateMock);
      const schema = z.object({ ok: z.boolean() });

      await expect(
        service.promptForStructuredJson("Ping", schema),
      ).rejects.toThrow("connection refused");
    });

    it("throws when the model content is not valid JSON", async () => {
      const generateMock = vi
        .fn<LLMProviderPort["generate"]>()
        .mockResolvedValue("not-json");
      const service = createConfiguredService(generateMock);
      const schema = z.object({ value: z.string() });

      await expect(
        service.promptForStructuredJson("Return value", schema),
      ).rejects.toBeInstanceOf(LLMServiceResponseFormatError);
    });

    it("throws when the model wraps JSON in code fences", async () => {
      const generateMock = vi
        .fn<LLMProviderPort["generate"]>()
        .mockResolvedValue('```json\n{"value":"ok"}\n```');
      const service = createConfiguredService(generateMock);
      const schema = z.object({ value: z.string() });

      await expect(
        service.promptForStructuredJson("Return value", schema),
      ).rejects.toBeInstanceOf(LLMServiceResponseFormatError);
    });

    it("throws when JSON shape does not match the expected schema", async () => {
      const generateMock = vi
        .fn<LLMProviderPort["generate"]>()
        .mockResolvedValue('{"blurb":"Only blurb"}');
      const service = createConfiguredService(generateMock);
      const schema = z.object({
        blurb: z.string(),
        tags: z.array(z.string()),
      });

      await expect(
        service.promptForStructuredJson("Return blurb and tags", schema),
      ).rejects.toBeInstanceOf(LLMServiceValidationError);
    });

    it("throws when provider returns empty content", async () => {
      const generateMock = vi
        .fn<LLMProviderPort["generate"]>()
        .mockResolvedValue("");
      const service = createConfiguredService(generateMock);
      const schema = z.object({ value: z.string() });

      await expect(
        service.promptForStructuredJson("Return value", schema),
      ).rejects.toBeInstanceOf(LLMServiceResponseFormatError);
    });
  });
});
