import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ChatRequest, ChatResponse } from "ollama";
import {
  LLMService,
  LLMServiceResponseFormatError,
  LLMServiceValidationError,
} from "../../services/LLMService.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createServiceWithChat(
  chatMock: (request: ChatRequest & { stream: false }) => Promise<ChatResponse>,
): LLMService {
  return new LLMService(
    {
      model: "llama3.1:8b",
      baseUrl: "http://127.0.0.1:11434",
    },
    {
      createOllamaClient: () => ({
        chat: chatMock,
      }),
    },
  );
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
      const chatMock = vi.fn().mockResolvedValue({
        message: {
          content:
            '{"blurb":"Summarizes a symbol","tags":["indexing","summary"]}',
        },
      });
      const service = createServiceWithChat(chatMock);
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

      expect(chatMock).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "llama3.1:8b",
          stream: false,
          format: "json",
          options: {
            temperature: 0.1,
          },
        }),
      );

      const call = chatMock.mock.calls[0]?.[0] as
        | { messages?: Array<{ content?: string }> }
        | undefined;

      expect(call?.messages?.[0]?.content).toContain("CodeAtlas");
    });

    it("bubbles SDK failures from Ollama chat", async () => {
      const chatMock = vi
        .fn()
        .mockRejectedValue(new Error("connection refused"));
      const service = createServiceWithChat(chatMock);
      const schema = z.object({ ok: z.boolean() });

      await expect(
        service.promptForStructuredJson("Ping", schema),
      ).rejects.toThrow("connection refused");
    });

    it("throws when the model content is not valid JSON", async () => {
      const chatMock = vi.fn().mockResolvedValue({
        message: {
          content: "not-json",
        },
      });
      const service = createServiceWithChat(chatMock);
      const schema = z.object({ value: z.string() });

      await expect(
        service.promptForStructuredJson("Return value", schema),
      ).rejects.toBeInstanceOf(LLMServiceResponseFormatError);
    });

    it("throws when the model wraps JSON in code fences", async () => {
      const chatMock = vi.fn().mockResolvedValue({
        message: {
          content: '```json\n{"value":"ok"}\n```',
        },
      });
      const service = createServiceWithChat(chatMock);
      const schema = z.object({ value: z.string() });

      await expect(
        service.promptForStructuredJson("Return value", schema),
      ).rejects.toBeInstanceOf(LLMServiceResponseFormatError);
    });

    it("throws when JSON shape does not match the expected schema", async () => {
      const chatMock = vi.fn().mockResolvedValue({
        message: {
          content: '{"blurb":"Only blurb"}',
        },
      });
      const service = createServiceWithChat(chatMock);
      const schema = z.object({
        blurb: z.string(),
        tags: z.array(z.string()),
      });

      await expect(
        service.promptForStructuredJson("Return blurb and tags", schema),
      ).rejects.toBeInstanceOf(LLMServiceValidationError);
    });

    it("throws when Ollama response has no message content", async () => {
      const chatMock = vi.fn().mockResolvedValue({
        message: {},
      });
      const service = createServiceWithChat(chatMock);
      const schema = z.object({ value: z.string() });

      await expect(
        service.promptForStructuredJson("Return value", schema),
      ).rejects.toBeInstanceOf(LLMServiceResponseFormatError);
    });
  });
});
