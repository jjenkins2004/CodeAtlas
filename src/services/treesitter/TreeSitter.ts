import Parser from "tree-sitter";
import path from "path";
import type {
  ExtractedSymbol,
  ParseRequest,
  TreeSitterLanguageAdapter,
} from "../../models/SymbolExtraction.js";

export interface TreeSitterServiceConfig {
  adapters?: TreeSitterLanguageAdapter[];
}

/**
 * Service shell for Tree-sitter parsing and symbol extraction.
 *
 * Intended flow:
 * 1) Resolve language adapter from file extension or explicit languageId.
 * 2) Load and set parser language.
 * 3) Parse source into a syntax tree.
 * 4) Delegate symbol extraction to the adapter.
 */
export class TreeSitterService {
  private parser: Parser;
  private adaptersById: Map<string, TreeSitterLanguageAdapter>;
  private adaptersByExtension: Map<string, TreeSitterLanguageAdapter>;

  constructor(config: TreeSitterServiceConfig = {}) {
    this.parser = new Parser();
    this.adaptersById = new Map();
    this.adaptersByExtension = new Map();

    for (const adapter of config.adapters ?? []) {
      this.registerAdapter(adapter);
    }
  }

  registerAdapter(adapter: TreeSitterLanguageAdapter): void {
    this.adaptersById.set(adapter.id, adapter);

    for (const extension of adapter.extensions) {
      this.adaptersByExtension.set(extension.toLowerCase(), adapter);
    }
  }

  async parse(_request: ParseRequest): Promise<Parser.Tree> {
    throw new Error("Not implemented: parse source with Tree-sitter");
  }

  async extractSymbols(_request: ParseRequest): Promise<ExtractedSymbol[]> {
    throw new Error("Not implemented: extract symbols from parse tree");
  }

  private resolveAdapter(request: ParseRequest): TreeSitterLanguageAdapter {
    if (request.languageId) {
      const byLanguageId = this.adaptersById.get(request.languageId);
      if (byLanguageId) {
        return byLanguageId;
      }
    }

    const extension = path.extname(request.filePath).toLowerCase();
    const byExtension = this.adaptersByExtension.get(extension);

    if (byExtension) {
      return byExtension;
    }

    throw new Error(
      `No Tree-sitter adapter registered for ${request.filePath} (${request.languageId ?? "unknown language"})`,
    );
  }

  // Reserved for future implementation to keep the intended control flow explicit.
  private async parseWithResolvedAdapter(
    _request: ParseRequest,
  ): Promise<{ adapter: TreeSitterLanguageAdapter; tree: Parser.Tree }> {
    throw new Error(
      "Not implemented: resolve adapter, set language, parse tree",
    );
  }
}
