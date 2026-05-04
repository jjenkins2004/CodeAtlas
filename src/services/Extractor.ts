import { SymbolType, Visibility } from "../models/index.js";

export interface ExtractedSymbol {
  symbol: string;
  file: string;
  type: SymbolType;
  visibility: Visibility;
  /** Raw source code block for the symbol */
  code: string;
}

/**
 * Wraps tree-sitter to extract public symbols from source files.
 * Language grammar loading and actual parsing is left to the implementation phase.
 */
export const Extractor = {
  /**
   * Parse a single source file and return all extractable symbols.
   *
   * @param filePath - Absolute path to the source file.
   */
  async extractFile(_filePath: string): Promise<ExtractedSymbol[]> {
    throw new Error("Not implemented");
  },
};
