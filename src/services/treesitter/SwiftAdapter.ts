import Parser from "tree-sitter";
import Swift from "tree-sitter-swift";
import {
  BaseTreeSitterLanguageAdapter,
  type CaptureMap,
} from "../../models/SymbolExtraction.js";
import type { SymbolType, Visibility } from "../../models/Symbol.js";
import { resolveTreeSitterLanguage } from "./resolveTreeSitterLanguage.js";
import { getRequiredCapture } from "./utils.js";

type SyntaxNode = Parser.SyntaxNode;

const SYMBOL_QUERY_TEMPLATE = `
  (class_declaration
    name: (type_identifier) $1) $2

  (protocol_declaration
    name: (type_identifier) $1) $2

  (function_declaration
    name: (simple_identifier) $1) $2

  (protocol_function_declaration
    name: (simple_identifier) $1) $2

  (init_declaration "init" $1) $2

  (deinit_declaration "deinit" $1) $2

  (function_declaration name: (custom_operator) $1) $2
  (function_declaration name: "==" $1) $2
  (function_declaration name: "<" $1) $2
  (function_declaration name: ">" $1) $2
  (function_declaration name: "+" $1) $2
  (function_declaration name: "-" $1) $2
  (function_declaration name: "*" $1) $2
  (function_declaration name: "/" $1) $2
  (function_declaration name: "%" $1) $2
`;

function resolveDeclarationType(
  definitionNode: SyntaxNode,
): SymbolType | undefined {
  if (definitionNode.type === "protocol_declaration") {
    return "protocol";
  }

  if (definitionNode.type === "protocol_function_declaration") {
    return "method";
  }

  if (definitionNode.type !== "class_declaration") {
    return undefined;
  }

  for (let index = 0; index < definitionNode.childCount; index += 1) {
    const child = definitionNode.child(index);

    if (!child) {
      continue;
    }

    if (child.type === "enum") {
      return "enum";
    }

    if (
      child.type === "class" ||
      child.type === "struct" ||
      child.type === "actor"
    ) {
      return "class";
    }

    if (child.type === "extension") {
      return undefined;
    }
  }

  return undefined;
}

function isMethodDefinition(definitionNode: SyntaxNode): boolean {
  if (definitionNode.type === "protocol_function_declaration") {
    return true;
  }

  let current: SyntaxNode | null = definitionNode.parent;

  while (current) {
    if (
      current.type === "class_declaration" ||
      current.type === "protocol_declaration"
    ) {
      return true;
    }

    if (
      current.type === "source_file" ||
      current.type === "function_declaration" ||
      current.type === "protocol_function_declaration" ||
      current.type === "closure_expression"
    ) {
      return false;
    }

    current = current.parent;
  }

  return false;
}

function classifyVisibility(definitionNode: SyntaxNode): Visibility {
  const modifiers = definitionNode.namedChildren.find(
    (child) => child.type === "modifiers",
  );

  if (!modifiers) {
    return "internal";
  }

  const modifierText = modifiers.text;

  if (/\b(open|public)\b/.test(modifierText)) {
    return "public";
  }

  if (/\b(private|fileprivate)\b/.test(modifierText)) {
    return "private";
  }

  if (/\binternal\b/.test(modifierText)) {
    return "internal";
  }

  return "internal";
}

function getContainerName(node: SyntaxNode): string | undefined {
  if (node.type === "protocol_declaration") {
    return node.childForFieldName("name")?.text;
  }

  if (node.type !== "class_declaration") {
    return undefined;
  }

  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index);

    if (!child) {
      continue;
    }

    if (child.type === "extension") {
      const extendedType = node.childForFieldName("name");

      return extendedType?.text;
    }

    if (
      child.type === "class" ||
      child.type === "struct" ||
      child.type === "enum"
    ) {
      return node.childForFieldName("name")?.text;
    }
  }

  return undefined;
}

export class SwiftAdapter extends BaseTreeSitterLanguageAdapter {
  id = "swift";
  extensions = [".swift"];
  language: Parser.Language = resolveTreeSitterLanguage(Swift);
  queryTemplate: string = SYMBOL_QUERY_TEMPLATE;

  getType(captures: CaptureMap): SymbolType | undefined {
    const definition = getRequiredCapture(captures, "symbol.definition");

    if (
      definition.type === "init_declaration" ||
      definition.type === "deinit_declaration"
    ) {
      return "method";
    }

    if (definition.type === "function_declaration") {
      return isMethodDefinition(definition) ? "method" : "function";
    }

    return resolveDeclarationType(definition);
  }

  getVisibility(_symbolName: string, definitionNode: SyntaxNode): Visibility {
    return classifyVisibility(definitionNode);
  }

  getSymbolPrefix(node: SyntaxNode): string | undefined {
    return getContainerName(node);
  }
}

export const swiftAdapter = new SwiftAdapter();
