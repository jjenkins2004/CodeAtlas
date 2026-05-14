import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  LLMService,
  LLMServiceResponseFormatError,
  LLMServiceValidationError,
} from "../../services/LLMService.js";
import type { LLMProviderPort } from "../../services/llm/LLMProvider.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createServiceWithChat(
  generateMock: LLMProviderPort["generate"],
): LLMService {
  return new LLMService({
    model: "llama3.1:8b",
    provider: {
      generate: generateMock,
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LLMService", () => {
  // ---------------------------------------------------------------------------
  // promptForStructuredJson()
  // ---------------------------------------------------------------------------

  describe("promptForStructuredJson()", () => {
    it("returns typed JSON when Ollama responds with valid content", async () => {
      const generateMock = vi
        .fn<LLMProviderPort["generate"]>()
        .mockResolvedValue(
          '{"blurb":"Summarizes a symbol","tags":["indexing","summary"]}',
        );
      const service = createServiceWithChat(generateMock);
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
      const service = createServiceWithChat(generateMock);
      const schema = z.object({ ok: z.boolean() });

      await expect(
        service.promptForStructuredJson("Ping", schema),
      ).rejects.toThrow("connection refused");
    });

    it("throws when the model content is not valid JSON", async () => {
      const generateMock = vi
        .fn<LLMProviderPort["generate"]>()
        .mockResolvedValue("not-json");
      const service = createServiceWithChat(generateMock);
      const schema = z.object({ value: z.string() });

      await expect(
        service.promptForStructuredJson("Return value", schema),
      ).rejects.toBeInstanceOf(LLMServiceResponseFormatError);
    });

    it("throws when the model wraps JSON in code fences", async () => {
      const generateMock = vi
        .fn<LLMProviderPort["generate"]>()
        .mockResolvedValue('```json\n{"value":"ok"}\n```');
      const service = createServiceWithChat(generateMock);
      const schema = z.object({ value: z.string() });

      await expect(
        service.promptForStructuredJson("Return value", schema),
      ).rejects.toBeInstanceOf(LLMServiceResponseFormatError);
    });

    it("throws when JSON shape does not match the expected schema", async () => {
      const generateMock = vi
        .fn<LLMProviderPort["generate"]>()
        .mockResolvedValue('{"blurb":"Only blurb"}');
      const service = createServiceWithChat(generateMock);
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
      const service = createServiceWithChat(generateMock);
      const schema = z.object({ value: z.string() });

      await expect(
        service.promptForStructuredJson("Return value", schema),
      ).rejects.toBeInstanceOf(LLMServiceResponseFormatError);
    });
  });
});
