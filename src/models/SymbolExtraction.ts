import type Parser from "tree-sitter";
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
 * Capture lookup map where keys are capture names and values are matched nodes.
 */
export type CaptureMap = Map<string, Parser.SyntaxNode>;

/**
 * Contract implemented by each language adapter.
 */
export interface TreeSitterLanguageAdapter {
  /** Stable language id used for registration and lookup, e.g. "python". */
  id: string;

  /** File extensions handled by this adapter, including the leading dot. */
  extensions: string[];

  /** Tree-sitter language object compatible with Parser.setLanguage(...). */
  language: Parser.Language;

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
  queryTemplate: string;

  /**
   * Maps a match's capture map to a normalized SymbolType.
   */
  getType(captures: CaptureMap): SymbolType;

  /**
   * Computes symbol visibility from the extracted symbol name.
   * TODO: Visibility may require AST context in some languages (e.g. modifiers
   * on a definition node). Consider accepting CaptureMap or definition node
   * input in addition to symbolName.
   */
  getVisibility(symbolName: string): Visibility;
}
