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

export type CaptureMap = Map<string, Parser.SyntaxNode>;

export interface TreeSitterLanguageAdapter {
  id: string;
  extensions: string[];
  language: Parser.Language;
  queryTemplate: string;
  getType(captures: CaptureMap): SymbolType;
  getVisibility(symbolName: string): Visibility;
}
