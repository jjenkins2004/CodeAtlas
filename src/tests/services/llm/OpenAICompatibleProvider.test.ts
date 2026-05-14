import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleProvider } from "../../../services/llm/OpenAICompatibleProvider.js";
import type { LLMProviderRequest } from "../../../services/llm/LLMProvider.js";

const { openAIChatCreateMock, openAIConstructorArgs } = vi.hoisted(() => ({
  openAIChatCreateMock: vi.fn(),
  openAIConstructorArgs: [] as Array<{ apiKey: string }>,
}));

vi.mock("openai", () => ({
  default: class OpenAIMock {
    chat = {
      completions: {
        create: openAIChatCreateMock,
      },
    };

    constructor(config: { apiKey: string }) {
      openAIConstructorArgs.push(config);
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
    model: "gpt-4o-mini",
    systemPrompt: "System prompt",
    userPrompt: "User prompt",
    temperature: 0.1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OpenAICompatibleProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openAIConstructorArgs.length = 0;
  });

  // ---------------------------------------------------------------------------
  // generate()
  // ---------------------------------------------------------------------------

  describe("generate()", () => {
    it("constructs OpenAI client and forwards request payload", async () => {
      openAIChatCreateMock.mockResolvedValue({
        choices: [{ message: { content: '{"ok":true}' } }],
      });

      const provider = new OpenAICompatibleProvider({
        apiKey: "test-key",
      });

      const result = await provider.generate(makeRequest());

      expect(result).toBe('{"ok":true}');

      expect(openAIConstructorArgs).toEqual([
        {
          apiKey: "test-key",
        },
      ]);

      expect(openAIChatCreateMock).toHaveBeenCalledWith({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.1,
        messages: [
          { role: "system", content: "System prompt" },
          { role: "user", content: "User prompt" },
        ],
      });
    });

    it("throws when response content is missing", async () => {
      openAIChatCreateMock.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

      const provider = new OpenAICompatibleProvider({
        apiKey: "test-key",
      });

      await expect(provider.generate(makeRequest())).rejects.toThrow(
        "OpenAI-compatible response did not include message content",
      );
    });
  });
});
