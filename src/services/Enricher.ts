import { ExtractedSymbol } from "./Extractor.js";

export interface EnrichedSymbol extends ExtractedSymbol {
  blurb: string;
  implementation: string;
  tags: string[];
  embedding: number[];
}

/**
 * Responsible for LLM-based semantic enrichment and embedding generation.
 * LLM and embedding API calls are left to the implementation phase.
 */
export const Enricher = {
  /**
   * Generate blurb, implementation summary, and semantic tags for a symbol,
   * then produce a vector embedding of the combined semantic text.
   *
   * @param symbol - Raw extracted symbol with its source code.
   * @param existingBlurb - Optional existing blurb; skip regeneration if unchanged.
   */
  async enrich(
    _symbol: ExtractedSymbol,
    _existingBlurb?: string
  ): Promise<EnrichedSymbol> {
    throw new Error("Not implemented");
  },

  /**
   * Embed a raw query string for similarity search.
   *
   * @param query - Natural-language query to embed.
   */
  async embedQuery(_query: string): Promise<number[]> {
    throw new Error("Not implemented");
  },
};
