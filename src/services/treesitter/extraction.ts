import Parser from "tree-sitter";
import type {
  CaptureMap,
  ExtractedSymbol,
  SymbolRule,
  TreeSitterLanguageAdapter,
} from "../../models/SymbolExtraction.js";

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
  adapter: TreeSitterLanguageAdapter,
): ExtractedSymbol[] {
  const parser = new Parser();
  parser.setLanguage(adapter.language);

  const tree = parser.parse(source);
  const symbols: ExtractedSymbol[] = [];
  const matches = adapter.query.matches(tree.rootNode);

  for (const match of matches) {
    const captures = buildCaptureMap(match.captures);

    for (const rule of adapter.symbolRules) {
      if (!hasAllCaptures(captures, rule.requiredCaptures)) {
        continue;
      }

      symbols.push(rule.buildSymbol(captures, source));
      break;
    }
  }

  return symbols;
}
