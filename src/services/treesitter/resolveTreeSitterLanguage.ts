import type Parser from "tree-sitter";

export function resolveTreeSitterLanguage(
  moduleLike: unknown,
): Parser.Language {
  return moduleLike as Parser.Language;
}
