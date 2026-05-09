import Parser from "tree-sitter";
import type {
  BaseTreeSitterLanguageAdapter,
  CaptureMap,
  ExtractedSymbol,
} from "../../models/SymbolExtraction.js";
import { extractNodeText, getRequiredCapture } from "./utils.js";

function buildCaptureMap(captures: Parser.QueryCapture[]): CaptureMap {
  // Tree-sitter returns captures as a flat array like:
  // [{ name: "symbol.name", node: ... }, { name: "symbol.definition", node: ... }].
  // We normalize that into a map for easier lookup
  const byName = new Map<string, Parser.SyntaxNode>();

  for (const capture of captures) {
    byName.set(capture.name, capture.node);
  }

  return byName;
}

function hasAllCaptures(captures: CaptureMap, names: string[]): boolean {
  return names.every((name) => captures.has(name));
}

function buildQualifiedSymbolName(
  symbolName: string,
  definitionNode: Parser.SyntaxNode,
  adapter: BaseTreeSitterLanguageAdapter,
): string {
  const prefixes: string[] = [];
  let current: Parser.SyntaxNode | null = definitionNode.parent;

  // Walk up the tree and collect nearest container names from inner to outer.
  while (current) {
    const prefix = adapter.getSymbolPrefix(current);

    if (prefix) {
      prefixes.push(prefix);
    }

    current = current.parent;
  }

  if (prefixes.length === 0) {
    return symbolName;
  }

  return `${prefixes.reverse().join(".")}.${symbolName}`;
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
    const qualifiedSymbolName = buildQualifiedSymbolName(
      symbolName,
      definitionNode,
      adapter,
    );
    const symbolBody = extractNodeText(source, definitionNode);
    const symbolType = adapter.getType(captures);

    if (!symbolType) {
      continue;
    }

    symbols.push({
      symbol: qualifiedSymbolName,
      type: symbolType,
      visibility: adapter.getVisibility(symbolName, definitionNode),
      body: symbolBody,
    });
  }

  return symbols;
}
