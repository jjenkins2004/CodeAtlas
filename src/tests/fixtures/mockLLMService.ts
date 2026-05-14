import { vi } from "vitest";
import type { LLMServicePort } from "../../services/LLMService.js";

export type MockLLMService = LLMServicePort & {
  isConfigured: ReturnType<typeof vi.fn>;
  promptForStructuredJson: ReturnType<typeof vi.fn>;
};

export function createMockLLMService(
  overrides: Partial<LLMServicePort> = {},
): MockLLMService {
  return {
    isConfigured: vi.fn().mockReturnValue(true),
    promptForStructuredJson: vi.fn(),
    ...overrides,
  } as MockLLMService;
}
