import type Parser from "tree-sitter";
import type { CaptureMap } from "../../models/SymbolExtraction.js";

export function extractNodeText(
  source: string,
  node: Parser.SyntaxNode,
): string {
  return source.slice(node.startIndex, node.endIndex);
}

export function getRequiredCapture(
  captures: CaptureMap,
  name: string,
): Parser.SyntaxNode {
  const node = captures.get(name);

  if (!node) {
    throw new Error(`Missing required capture: ${name}`);
  }

  return node;
}
