import { describe, it, expect } from "vitest";
import { swiftAdapter } from "../../../services/treesitter/SwiftAdapter.js";
import { extractSymbolsFromSource } from "../../../services/treesitter/extraction.js";
import type { ExtractedSymbol } from "../../../models/SymbolExtraction.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Runs the end-to-end extraction flow against the real Swift adapter.
 */
function parseAndExtract(source: string): ExtractedSymbol[] {
  return extractSymbolsFromSource(source, swiftAdapter);
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

describe("SwiftAdapter", () => {
  // ---------------------------------------------------------------------------
  // extractSymbolsFromSource()
  // ---------------------------------------------------------------------------

  describe("extractSymbolsFromSource()", () => {
    it("extracts top-level class, struct, enum, and protocol declarations", () => {
      const source = [
        "public class Greeter {",
        "  func hello() {}",
        "}",
        "",
        "internal struct Payload {",
        "  let value: Int",
        "}",
        "",
        "enum Mode {",
        "  case active",
        "}",
        "",
        "protocol Runner {",
        "  func run()",
        "}",
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);

      expect(findSymbol(symbols, "Greeter", "class").visibility).toBe("public");
      expect(findSymbol(symbols, "Payload", "class").visibility).toBe(
        "internal",
      );
      expect(findSymbol(symbols, "Mode", "enum").visibility).toBe("internal");
      expect(findSymbol(symbols, "Runner", "protocol").visibility).toBe(
        "internal",
      );
    });

    it("extracts top-level functions with public, internal, and private visibility", () => {
      const source = [
        "public func publicFunction() {}",
        "",
        "func internalFunction() {}",
        "",
        "private func privateFunction() {}",
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);

      expect(findSymbol(symbols, "publicFunction", "function").visibility).toBe(
        "public",
      );
      expect(
        findSymbol(symbols, "internalFunction", "function").visibility,
      ).toBe("internal");
      expect(
        findSymbol(symbols, "privateFunction", "function").visibility,
      ).toBe("private");
    });

    it("extracts methods from types and classifies local nested functions as functions", () => {
      const source = [
        "class Container {",
        "  func method() {",
        "    func nestedInsideMethod() {}",
        "    nestedInsideMethod()",
        "  }",
        "}",
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);

      expect(findSymbol(symbols, "Container.method", "method").visibility).toBe(
        "internal",
      );
      expect(
        findSymbol(symbols, "Container.nestedInsideMethod", "function")
          .visibility,
      ).toBe("internal");
    });

    it("extracts nested type members with fully qualified names", () => {
      const source = [
        "class Outer {",
        "  class Inner {",
        "    func innerMethod() {}",
        "  }",
        "",
        "  func outerMethod() {}",
        "}",
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);

      expect(findSymbol(symbols, "Outer", "class")).toBeDefined();
      expect(findSymbol(symbols, "Outer.Inner", "class")).toBeDefined();
      expect(findSymbol(symbols, "Outer.outerMethod", "method")).toBeDefined();
      expect(
        findSymbol(symbols, "Outer.Inner.innerMethod", "method"),
      ).toBeDefined();
    });

    it("qualifies extension methods under the extended type", () => {
      const source = [
        "struct Account {}",
        "",
        "extension Account {",
        "  public func displayName() {}",
        "}",
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);
      const displayName = findSymbol(symbols, "Account.displayName", "method");

      expect(displayName.visibility).toBe("public");
      expect(displayName.body).toBe("public func displayName() {}");
    });

    it("extracts protocol requirements as methods under the protocol name", () => {
      const source = [
        "public protocol Service {",
        "  func execute()",
        "}",
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);

      expect(findSymbol(symbols, "Service", "protocol").visibility).toBe(
        "public",
      );
      expect(findSymbol(symbols, "Service.execute", "method").visibility).toBe(
        "internal",
      );
    });

    it("extracts multiple symbols in source order with exact names and bodies", () => {
      const source = [
        "func alpha() {}",
        "",
        "class Beta {}",
        "",
        "func gamma() {}",
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);

      expect(
        symbols.map((symbol) => `${symbol.type}:${symbol.symbol}`),
      ).toEqual(["function:alpha", "class:Beta", "function:gamma"]);
      expect(symbols[0]?.body).toBe("func alpha() {}");
      expect(symbols[1]?.body).toBe("class Beta {}");
      expect(symbols[2]?.body).toBe("func gamma() {}");
    });

    it("returns an empty array when the source has no class or function definitions", () => {
      const source = ["let value = 42", "let copy = value + 1", ""].join("\n");

      expect(parseAndExtract(source)).toEqual([]);
    });

    it("extracts initializers and deinitializers as methods with full bodies", () => {
      const source = [
        "public class Session {",
        "  public init() {",
        "    print('init')",
        "  }",
        "",
        "  deinit {",
        "    print('deinit')",
        "  }",
        "}",
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);

      const initializer = findSymbol(symbols, "Session.init", "method");
      const deinitializer = findSymbol(symbols, "Session.deinit", "method");

      expect(initializer.visibility).toBe("public");
      expect(deinitializer.visibility).toBe("internal");
      expect(initializer.body).toContain("public init() {");
      expect(deinitializer.body).toContain("deinit {");
      expect(deinitializer.body).toContain("print('deinit')");
    });

    it("extracts visibility correctly from complex modifier stacks", () => {
      const source = [
        "struct ModifierBox {",
        "  public static final func build() {}",
        "  private mutating func reset() {}",
        "  fileprivate static func internalFactory() {}",
        "}",
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);

      expect(
        findSymbol(symbols, "ModifierBox.build", "method").visibility,
      ).toBe("public");
      expect(
        findSymbol(symbols, "ModifierBox.reset", "method").visibility,
      ).toBe("private");
      expect(
        findSymbol(symbols, "ModifierBox.internalFactory", "method").visibility,
      ).toBe("private");
    });

    it("keeps clean symbol names for generics and where clauses", () => {
      const source = [
        "class Box<T> {",
        "  func put(_ value: T) {}",
        "}",
        "",
        "extension Array where Element: Equatable {",
        "  func deduped() -> [Element] {",
        "    self",
        "  }",
        "}",
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);

      expect(findSymbol(symbols, "Box", "class")).toBeDefined();
      expect(findSymbol(symbols, "Box.put", "method")).toBeDefined();
      expect(findSymbol(symbols, "Array.deduped", "method")).toBeDefined();
    });

    it("extracts actors and classifies them like classes", () => {
      const source = [
        "public actor NetworkManager {",
        "  func ping() {}",
        "}",
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);
      const actor = findSymbol(symbols, "NetworkManager", "class");

      expect(actor.visibility).toBe("public");
      expect(actor.body).toContain("public actor NetworkManager {");
    });

    it("extracts operator overloads with operator symbols as method names", () => {
      const source = [
        "struct ComparableThing {",
        "  static func == (lhs: ComparableThing, rhs: ComparableThing) -> Bool {",
        "    lhs.id == rhs.id",
        "  }",
        "",
        "  let id: Int",
        "}",
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);
      const equals = findSymbol(symbols, "ComparableThing.==", "method");

      expect(equals.visibility).toBe("internal");
      expect(equals.body).toContain(
        "func == (lhs: ComparableThing, rhs: ComparableThing)",
      );
    });

    it("keeps attributes in bodies without polluting symbol names", () => {
      const source = [
        "@objcMembers",
        "class LegacyApi {",
        "  @MainActor",
        "  @discardableResult",
        "  func load() -> Int {",
        "    1",
        "  }",
        "}",
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);
      const legacy = findSymbol(symbols, "LegacyApi", "class");
      const load = findSymbol(symbols, "LegacyApi.load", "method");

      expect(legacy.body).toContain("@objcMembers\nclass LegacyApi {");
      expect(load.body).toContain(
        "@MainActor\n  @discardableResult\n  func load() -> Int {",
      );
      expect(load.symbol).toBe("LegacyApi.load");
    });

    it("extracts nested types declared inside extensions with full qualified names", () => {
      const source = [
        "extension String {",
        "  struct Helper {",
        "    func run() {}",
        "  }",
        "}",
        "",
      ].join("\n");

      const symbols = parseAndExtract(source);

      expect(findSymbol(symbols, "String.Helper", "class")).toBeDefined();
      expect(findSymbol(symbols, "String.Helper.run", "method")).toBeDefined();
    });
  });
});
