import Parser from "tree-sitter";
import Python from "tree-sitter-python";
import type {
  CaptureMap,
  SymbolRule,
  TreeSitterLanguageAdapter,
} from "../../models/SymbolExtraction.js";
import type { Visibility } from "../../models/Symbol.js";
import { resolveTreeSitterLanguage } from "./resolveTreeSitterLanguage.js";
import { extractNodeText, getRequiredCapture } from "./utils.js";

type SyntaxNode = Parser.SyntaxNode;

const SYMBOL_QUERY = new Parser.Query(
  resolveTreeSitterLanguage(Python),
  `
	(class_definition
		name: (identifier) @class.name) @class.definition

	(function_definition
		name: (identifier) @function.name) @function.definition
`,
);

function getVisibility(symbolName: string): Visibility {
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

const SYMBOL_RULES: SymbolRule[] = [
  {
    requiredCaptures: ["class.name", "class.definition"],
    buildSymbol(captures, source) {
      const className = getRequiredCapture(captures, "class.name");
      const classDefinition = getRequiredCapture(captures, "class.definition");
      const symbolName = extractNodeText(source, className);
      const symbolBody = extractNodeText(source, classDefinition);

      return {
        symbol: symbolName,
        type: "class",
        visibility: getVisibility(symbolName),
        body: symbolBody,
      };
    },
  },
  {
    requiredCaptures: ["function.name", "function.definition"],
    buildSymbol(captures, source) {
      const functionName = getRequiredCapture(captures, "function.name");
      const functionDefinition = getRequiredCapture(
        captures,
        "function.definition",
      );
      const symbolName = extractNodeText(source, functionName);
      const symbolBody = extractNodeText(source, functionDefinition);

      return {
        symbol: symbolName,
        type: isMethodDefinition(functionDefinition) ? "method" : "function",
        visibility: getVisibility(symbolName),
        body: symbolBody,
      };
    },
  },
];

export class PythonAdapter implements TreeSitterLanguageAdapter {
  id = "python";
  extensions = [".py", ".pyi"];
  language: Parser.Language = resolveTreeSitterLanguage(Python);
  query: Parser.Query = SYMBOL_QUERY;
  symbolRules: SymbolRule[] = SYMBOL_RULES;
}

export const pythonAdapter = new PythonAdapter();
