import { beforeEach, describe, expect, it, vi } from "vitest";
import { OllamaProvider } from "../../../services/llm/OllamaProvider.js";
import type { LLMProviderRequest } from "../../../services/llm/LLMProvider.js";

const { ollamaChatMock, ollamaConstructorArgs } = vi.hoisted(() => ({
  ollamaChatMock: vi.fn(),
  ollamaConstructorArgs: [] as Array<{ host: string }>,
}));

vi.mock("ollama", () => ({
  Ollama: class OllamaMock {
    chat = ollamaChatMock;

    constructor(config: { host: string }) {
      ollamaConstructorArgs.push(config);
    }
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  overrides: Partial<LLMProviderRequest> = {},
): LLMProviderRequest {
  return {
    model: "llama3.1:8b",
    systemPrompt: "System prompt",
    userPrompt: "User prompt",
    temperature: 0.1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OllamaProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ollamaConstructorArgs.length = 0;
  });

  // ---------------------------------------------------------------------------
  // generate()
  // ---------------------------------------------------------------------------

  describe("generate()", () => {
    it("constructs Ollama client and forwards request payload", async () => {
      ollamaChatMock.mockResolvedValue({
        message: { content: '{"ok":true}' },
      });

      const provider = new OllamaProvider({
        baseUrl: "http://127.0.0.1:11434",
      });

      const result = await provider.generate(makeRequest());

      expect(result).toBe('{"ok":true}');

      expect(ollamaConstructorArgs).toEqual([
        {
          host: "http://127.0.0.1:11434",
        },
      ]);

      expect(ollamaChatMock).toHaveBeenCalledWith({
        model: "llama3.1:8b",
        stream: false,
        format: "json",
        options: {
          temperature: 0.1,
        },
        messages: [
          { role: "system", content: "System prompt" },
          { role: "user", content: "User prompt" },
        ],
      });
    });

    it("throws when response content is missing", async () => {
      ollamaChatMock.mockResolvedValue({
        message: { content: null },
      });

      const provider = new OllamaProvider({
        baseUrl: "http://127.0.0.1:11434",
      });

      await expect(provider.generate(makeRequest())).rejects.toThrow(
        "Ollama response did not include message content",
      );
    });
  });
});
