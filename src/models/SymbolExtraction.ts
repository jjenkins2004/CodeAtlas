import type Parser from "tree-sitter";
import { Visibility } from "./Symbol";

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

export interface SymbolRule {
  requiredCaptures: string[];
  buildSymbol(captures: CaptureMap, source: string): ExtractedSymbol;
}

export interface TreeSitterLanguageAdapter {
  id: string;
  extensions: string[];
  language: Parser.Language;
  query: Parser.Query;
  symbolRules: SymbolRule[];
}
