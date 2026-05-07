import Parser from "tree-sitter";
import type { SymbolType, Visibility } from "./Symbol";

export interface ExtractedSymbol {
  symbol: string;
  type: string;
  visibility: Visibility;
  body: string;
}

export interface ParseRequest {
  filePath: string;
  source: string;
  languageId?: string;
}

/**
 * Capture lookup map where keys are capture names and values are the matched captured nodes.
 */
export type CaptureMap = Map<string, Parser.SyntaxNode>;

/**
 * Base contract implemented by each language adapter.
 */
export abstract class BaseTreeSitterLanguageAdapter {
  /** Stable language id used for registration and lookup, e.g. "python". */
  abstract id: string;

  /** File extensions handled by this adapter, including the leading dot. */
  abstract extensions: string[];

  /** Tree-sitter language object compatible with Parser.setLanguage(...). */
  abstract language: Parser.Language;

  /**
   * Tree-sitter query source template.
   *
   * Use "$1" where the symbol name capture should be injected and "$2" where
   * the symbol definition capture should be injected. At runtime these are
   * replaced with "@symbol.name" and "@symbol.definition" respectively.
   *
   * Example:
   * (class_definition name: (identifier) $1) $2
   */
  abstract queryTemplate: string;

  private compiledQuery: Parser.Query | undefined;

  /**
   * Returns the compiled Tree-sitter query for this adapter.
   * Implementations should compile lazily and cache the result.
   */
  getQuery(): Parser.Query {
    if (this.compiledQuery) {
      return this.compiledQuery;
    }

    const nameToken = "$1";
    const definitionToken = "$2";

    const querySource = this.queryTemplate
      .replaceAll(nameToken, "@symbol.name")
      .replaceAll(definitionToken, "@symbol.definition");

    this.compiledQuery = new Parser.Query(this.language, querySource);

    return this.compiledQuery;
  }

  /**
   * Maps a match's capture map to a normalized SymbolType.
   * Return undefined when the capture should be ignored.
   */
  abstract getType(captures: CaptureMap): SymbolType | undefined;

  /**
   * Computes symbol visibility from the extracted symbol name and definition
   * node AST context.
   */
  abstract getVisibility(
    symbolName: string,
    definitionNode: Parser.SyntaxNode,
  ): Visibility;
}
