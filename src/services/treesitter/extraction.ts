import Parser from "tree-sitter";
import type {
  BaseTreeSitterLanguageAdapter,
  CaptureMap,
  ExtractedSymbol,
} from "../../models/SymbolExtraction.js";
import { extractNodeText, getRequiredCapture } from "./utils.js";

function buildCaptureMap(captures: Parser.QueryCapture[]): CaptureMap {
  const byName = new Map<string, Parser.SyntaxNode>();

  for (const capture of captures) {
    byName.set(capture.name, capture.node);
  }

  return byName;
}

function hasAllCaptures(captures: CaptureMap, names: string[]): boolean {
  return names.every((name) => captures.has(name));
}

export function extractSymbolsFromSource(
  source: string,
  adapter: BaseTreeSitterLanguageAdapter,
): ExtractedSymbol[] {
  const parser = new Parser();
  parser.setLanguage(adapter.language);

  const tree = parser.parse(source);
  const symbols: ExtractedSymbol[] = [];
  const query = adapter.getQuery();
  const matches = query.matches(tree.rootNode);

  for (const match of matches) {
    const captures = buildCaptureMap(match.captures);

    if (!hasAllCaptures(captures, ["symbol.name", "symbol.definition"])) {
      continue;
    }

    const nameNode = getRequiredCapture(captures, "symbol.name");
    const definitionNode = getRequiredCapture(captures, "symbol.definition");
    const symbolName = extractNodeText(source, nameNode);
    const symbolBody = extractNodeText(source, definitionNode);
    const symbolType = adapter.getType(captures);

    if (!symbolType) {
      continue;
    }

    symbols.push({
      symbol: symbolName,
      type: symbolType,
      visibility: adapter.getVisibility(symbolName, definitionNode),
      body: symbolBody,
    });
  }

  return symbols;
}
