import Parser from "tree-sitter";
import Python from "tree-sitter-python";
import type {
  CaptureMap,
  TreeSitterLanguageAdapter,
} from "../../models/SymbolExtraction.js";
import type { SymbolType, Visibility } from "../../models/Symbol.js";
import { resolveTreeSitterLanguage } from "./resolveTreeSitterLanguage.js";
import { getRequiredCapture } from "./utils.js";

type SyntaxNode = Parser.SyntaxNode;

const SYMBOL_QUERY_TEMPLATE = `
	(class_definition
  name: (identifier) $1) $2

	(function_definition
  name: (identifier) $1) $2
`;

function classifyVisibility(symbolName: string): Visibility {
  if (symbolName.startsWith("__") && !symbolName.endsWith("__")) {
    return "private";
  }

  if (symbolName.startsWith("_")) {
    return "internal";
  }

  return "public";
}

function isMethodDefinition(definitionNode: SyntaxNode): boolean {
  let current: SyntaxNode | null = definitionNode.parent;

  while (current) {
    if (current.type === "class_definition") {
      return true;
    }

    if (
      current.type === "module" ||
      current.type === "function_definition" ||
      current.type === "lambda"
    ) {
      return false;
    }

    current = current.parent;
  }

  return false;
}

export class PythonAdapter implements TreeSitterLanguageAdapter {
  id = "python";
  extensions = [".py", ".pyi"];
  language: Parser.Language = resolveTreeSitterLanguage(Python);
  queryTemplate: string = SYMBOL_QUERY_TEMPLATE;

  getType(captures: CaptureMap): SymbolType {
    const definition = getRequiredCapture(captures, "symbol.definition");

    if (definition.type === "class_definition") {
      return "class";
    }

    if (definition.type === "function_definition") {
      return isMethodDefinition(definition) ? "method" : "function";
    }

    return "function";
  }

  getVisibility(symbolName: string): Visibility {
    return classifyVisibility(symbolName);
  }
}

export const pythonAdapter = new PythonAdapter();
