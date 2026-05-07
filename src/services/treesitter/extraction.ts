import Parser from "tree-sitter";
import type {
  CaptureMap,
  ExtractedSymbol,
  TreeSitterLanguageAdapter,
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

function compileQuery(adapter: TreeSitterLanguageAdapter): Parser.Query {
  const nameToken = "$1";
  const definitionToken = "$2";

  const querySource = adapter.queryTemplate
    .replaceAll(nameToken, "@symbol.name")
    .replaceAll(definitionToken, "@symbol.definition");

  return new Parser.Query(adapter.language, querySource);
}

export function extractSymbolsFromSource(
  source: string,
  adapter: TreeSitterLanguageAdapter,
): ExtractedSymbol[] {
  const parser = new Parser();
  parser.setLanguage(adapter.language);

  const tree = parser.parse(source);
  const symbols: ExtractedSymbol[] = [];
  const query = compileQuery(adapter);
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

    symbols.push({
      symbol: symbolName,
      type: adapter.getType(captures),
      visibility: adapter.getVisibility(symbolName),
      body: symbolBody,
    });
  }

  return symbols;
}
