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
      const init = findSymbol(symbols, "User.__init__", "method");

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
      expect(findSymbol(symbols, "Outer.Inner", "class").visibility).toBe(
        "public",
      );
      expect(findSymbol(symbols, "Outer.outer_method", "method").body).toBe(
        ["def outer_method(self):", "        return 'outer'"].join("\n"),
      );
      expect(
        findSymbol(symbols, "Outer.Inner.inner_method", "method").body,
      ).toBe(
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
      expect(findSymbol(symbols, "Container.method", "method")).toBeDefined();
      expect(
        findSymbol(symbols, "Container.nested_inside_method", "function"),
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
      expect(findSymbol(symbols, "Top.Middle", "class")).toBeDefined();
      expect(findSymbol(symbols, "Top.Middle.Bottom", "class")).toBeDefined();
      expect(findSymbol(symbols, "Top.top_method", "method")).toBeDefined();
      expect(
        findSymbol(symbols, "Top.Middle.middle_method", "method"),
      ).toBeDefined();
      expect(
        findSymbol(symbols, "Top.Middle.Bottom.bottom_method", "method"),
      ).toBeDefined();
    });

    it("extracts decorated functions and classes, keeping the decorator in the body", () => {
      const source = [
        "@dataclass",
        "class Config:",
        "    @property",
        "    def is_valid(self):",
        "        return True",
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);

      const configClass = findSymbol(symbols, "Config", "class");
      const validMethod = findSymbol(symbols, "Config.is_valid", "method");

      // The body MUST include the decorator.
      expect(configClass.body).toContain("@dataclass\nclass Config:");
      expect(validMethod.body).toContain("@property\n    def is_valid");
    });

    it("extracts async functions and methods correctly", () => {
      const source = [
        "async def fetch_data():",
        "    await asyncio.sleep(1)",
        "    return data",
        "",
        "class Client:",
        "    async def connect(self):",
        "        pass",
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);

      const fetchFunc = findSymbol(symbols, "fetch_data", "function");
      const connectMethod = findSymbol(symbols, "Client.connect", "method");

      expect(fetchFunc.body).toContain("async def fetch_data():");
      expect(connectMethod.body).toContain("async def connect(self):");
    });

    it("correctly identifies names ignoring inheritance and type hints", () => {
      const source = [
        "class CustomError(Exception):",
        "    def handle(self, code: int) -> str:",
        "        return 'fixed'",
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);

      // If the parser gets confused, it might name this "Exception" instead of "CustomError"
      const customError = findSymbol(symbols, "CustomError", "class");

      // If the parser gets confused, it might name this "str" instead of "handle"
      const handleMethod = findSymbol(symbols, "CustomError.handle", "method");

      expect(customError).toBeDefined();
      expect(handleMethod.body).toContain("-> str:");
    });

    it("extracts functions with multiple decorators and decorators with arguments", () => {
      const source = [
        "@app.route('/api/v1/users', methods=['GET'])",
        "@require_auth",
        "@rate_limit(max_requests=100)",
        "def get_users():",
        "    return []",
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);
      const getUsers = findSymbol(symbols, "get_users", "function");

      // The body MUST include all decorators.
      expect(getUsers.body).toContain(
        "@app.route('/api/v1/users', methods=['GET'])",
      );
      expect(getUsers.body).toContain("@require_auth");
      expect(getUsers.body).toContain("@rate_limit(max_requests=100)");
      expect(getUsers.body).toContain("def get_users():");
    });

    it("safely ignores control flow blocks (if, try, with) when determining prefixes and method types", () => {
      const source = [
        "if __name__ == '__main__':",
        "    class AppContext:",
        "        def run(self):",
        "            pass",
        "",
        "    def standalone_func():",
        "        pass",
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);

      // Should be named "AppContext", not "if.AppContext"
      const appClass = findSymbol(symbols, "AppContext", "class");

      // Should be recognized as a method, not a function, even though it's inside an if block
      const runMethod = findSymbol(symbols, "AppContext.run", "method");

      // Should be recognized as a standard function, not a method
      const standaloneFunc = findSymbol(symbols, "standalone_func", "function");

      expect(appClass).toBeDefined();
      expect(runMethod).toBeDefined();
      expect(standaloneFunc).toBeDefined();
    });

    it("extracts parseable symbols even when nearby declarations have syntax errors", () => {
      const source = [
        "def top_level():",
        "    return 'top'",
        "",
        "class Working:",
        "    def ok(self):",
        "        return 'ok'",
        "",
        "    def broken(self)",
        "        return 'broken'",
        "",
        "    def also_broken(self, value",
        "        return value",
        "",
        "class AnotherBroken:",
        "    def ignored(self):",
        "        return 'ignored'",
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);

      expect(symbols).toEqual([
        {
          body: "def top_level():\n    return 'top'",
          symbol: "top_level",
          type: "function",
          visibility: "public",
        },
        {
          symbol: "Working.ok",
          type: "method",
          visibility: "public",
          body: "def ok(self):\n        return 'ok'",
        },
      ]);
    });
  });
});
