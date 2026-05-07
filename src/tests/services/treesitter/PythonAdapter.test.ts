import { describe, it, expect, beforeEach } from "vitest";
import { pythonAdapter } from "../../../services/treesitter/PythonAdapter.js";
import { extractSymbolsFromSource } from "../../../services/treesitter/extraction.js";
import type { ExtractedSymbol } from "../../../models/SymbolExtraction.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Runs the end-to-end extraction flow against the real Python adapter.
 */
function parseAndExtract(source: string): ExtractedSymbol[] {
  return extractSymbolsFromSource(source, pythonAdapter);
}

function findSymbol(
  symbols: ExtractedSymbol[],
  symbolName: string,
  type: string,
): ExtractedSymbol {
  const symbol = symbols.find(
    (candidate) => candidate.symbol === symbolName && candidate.type === type,
  );

  expect(symbol).toBeDefined();
  return symbol as ExtractedSymbol;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PythonAdapter", () => {

  // ---------------------------------------------------------------------------
  // extractSymbolsFromSource()
  // ---------------------------------------------------------------------------

  describe("extractSymbolsFromSource()", () => {
    it("extracts top-level classes and preserves the full class body", () => {
      const source = [
        "class Greeter:",
        "    def hello(self):",
        '        return "hi"',
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);
      const greeter = findSymbol(symbols, "Greeter", "class");

      expect(greeter.visibility).toBe("public");
      expect(greeter.body).toBe(source.trimEnd());
    });

    it("extracts top-level functions with public, internal, and private visibility", () => {
      const source = [
        "def public_function():",
        "    return 1",
        "",
        "def _internal_function():",
        "    return 2",
        "",
        "def __private_function():",
        "    return 3",
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);

      expect(
        findSymbol(symbols, "public_function", "function").visibility,
      ).toBe("public");
      expect(
        findSymbol(symbols, "_internal_function", "function").visibility,
      ).toBe("internal");
      expect(
        findSymbol(symbols, "__private_function", "function").visibility,
      ).toBe("private");
    });

    it("treats dunder methods as methods and not private functions", () => {
      const source = [
        "class User:",
        "    def __init__(self, name):",
        "        self.name = name",
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);
      const init = findSymbol(symbols, "__init__", "method");

      expect(init.visibility).toBe("internal");
      expect(init.body).toContain("self.name = name");
    });

    it("extracts methods from classes and nested classes", () => {
      const source = [
        "class Outer:",
        "    def outer_method(self):",
        "        return 'outer'",
        "",
        "    class Inner:",
        "        def inner_method(self):",
        "            return 'inner'",
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);

      expect(findSymbol(symbols, "Outer", "class").visibility).toBe("public");
      expect(findSymbol(symbols, "Inner", "class").visibility).toBe("public");
      expect(findSymbol(symbols, "outer_method", "method").body).toBe(
        ["def outer_method(self):", "        return 'outer'"].join("\n"),
      );
      expect(findSymbol(symbols, "inner_method", "method").body).toBe(
        ["def inner_method(self):", "            return 'inner'"].join("\n"),
      );
    });

    it("treats nested functions inside functions and methods as functions", () => {
      const source = [
        "def top_level():",
        "    def nested_inside_function():",
        "        return 'function'",
        "    return nested_inside_function()",
        "",
        "class Container:",
        "    def method(self):",
        "        def nested_inside_method():",
        "            return 'method'",
        "        return nested_inside_method()",
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);

      expect(findSymbol(symbols, "top_level", "function")).toBeDefined();
      expect(
        findSymbol(symbols, "nested_inside_function", "function"),
      ).toBeDefined();
      expect(findSymbol(symbols, "method", "method")).toBeDefined();
      expect(
        findSymbol(symbols, "nested_inside_method", "function"),
      ).toBeDefined();
    });

    it("extracts multiple symbols in source order with exact names and bodies", () => {
      const source = [
        "def alpha():",
        "    return 'a'",
        "",
        "class Beta:",
        "    pass",
        "",
        "def gamma():",
        "    return 'g'",
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);

      expect(
        symbols.map((symbol) => `${symbol.type}:${symbol.symbol}`),
      ).toEqual(["function:alpha", "class:Beta", "function:gamma"]);
      expect(symbols[0]?.body).toBe(
        ["def alpha():", "    return 'a'"].join("\n"),
      );
      expect(symbols[1]?.body).toBe(["class Beta:", "    pass"].join("\n"));
      expect(symbols[2]?.body).toBe(
        ["def gamma():", "    return 'g'"].join("\n"),
      );
    });

    it("returns an empty array when the source has no class or function definitions", () => {
      const source = [
        "value = 42",
        "numbers = [1, 2, 3]",
        "print(value, numbers)",
        "",
      ].join("\n");

      expect(parseAndExtract(source)).toEqual([]);
    });

    it("extracts nested classes and nested methods across multiple levels", () => {
      const source = [
        "class Top:",
        "    class Middle:",
        "        class Bottom:",
        "            def bottom_method(self):",
        "                return 'bottom'",
        "",
        "        def middle_method(self):",
        "            return 'middle'",
        "",
        "    def top_method(self):",
        "        return 'top'",
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);

      expect(findSymbol(symbols, "Top", "class")).toBeDefined();
      expect(findSymbol(symbols, "Middle", "class")).toBeDefined();
      expect(findSymbol(symbols, "Bottom", "class")).toBeDefined();
      expect(findSymbol(symbols, "top_method", "method")).toBeDefined();
      expect(findSymbol(symbols, "middle_method", "method")).toBeDefined();
      expect(findSymbol(symbols, "bottom_method", "method")).toBeDefined();
    });
  });
});
