import { vi } from "vitest";
import type { LLMServicePort } from "../../../services/LLMService.js";
import type { EmbeddingServicePort } from "../../../services/EmbeddingService.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * 1 536-dim non-zero vector that satisfies the pgvector column constraint.
 * Using a repeating pattern so the values are deterministic and non-trivial.
 */
export const MOCK_EMBEDDING: number[] = Array.from(
  { length: 1536 },
  (_, i) => ((i % 10) + 1) * 0.001,
);

/** Deterministic semantic fields returned by the mock LLM for every symbol. */
export const MOCK_SEMANTIC = {
  blurb: "Test blurb.",
  implementation: "Test implementation.",
  tags: ["test-tag"],
} as const;

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export type MockLLMService = LLMServicePort & {
  promptForStructuredJson: ReturnType<typeof vi.fn>;
};

/**
 * Returns a spied LLMServicePort that always resolves with MOCK_SEMANTIC.
 * Tests can override individual calls with `mockResolvedValueOnce` /
 * `mockRejectedValueOnce`.
 */
export function createMockLLMService(): MockLLMService {
  return {
    isConfigured: () => true,
    promptForStructuredJson: vi.fn().mockResolvedValue(MOCK_SEMANTIC),
  };
}

export type MockEmbeddingService = EmbeddingServicePort & {
  embed: ReturnType<typeof vi.fn>;
};

/**
 * Returns a spied EmbeddingServicePort that always resolves with MOCK_EMBEDDING.
 * Tests can override individual calls with `mockResolvedValueOnce` /
 * `mockRejectedValueOnce`.
 */
export function createMockEmbeddingService(): MockEmbeddingService {
  return {
    isConfigured: () => true,
    embed: vi.fn().mockResolvedValue(MOCK_EMBEDDING),
  };
}
