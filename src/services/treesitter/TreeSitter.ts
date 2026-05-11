import Parser from "tree-sitter";
import fs from "fs/promises";
import path from "path";
import type {
  BaseTreeSitterLanguageAdapter,
  ExtractedSymbol,
} from "../../models/SymbolExtraction.js";
import { extractSymbolsFromSource } from "./extraction.js";
import { swiftAdapter } from "./SwiftAdapter.js";
import { pythonAdapter } from "./PythonAdapter.js";

export interface TreeSitterServiceConfig {
  adapters?: BaseTreeSitterLanguageAdapter[];
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
  private adaptersById: Map<string, BaseTreeSitterLanguageAdapter>;
  private adaptersByExtension: Map<string, BaseTreeSitterLanguageAdapter>;

  constructor(config: TreeSitterServiceConfig = {}) {
    this.adaptersById = new Map();
    this.adaptersByExtension = new Map();

    for (const adapter of config.adapters ?? []) {
      this.registerAdapter(adapter);
    }
  }

  async extractSymbols(filePath: string): Promise<ExtractedSymbol[]> {
    const adapter = this.resolveAdapter(filePath);
    const source = await this.readSource(filePath);
    return extractSymbolsFromSource(source, adapter);
  }

  private async readSource(filePath: string): Promise<string> {
    return fs.readFile(filePath, "utf-8");
  }

  private resolveAdapter(filePath: string): BaseTreeSitterLanguageAdapter {
    const extension = path.extname(filePath).toLowerCase();
    const byExtension = this.adaptersByExtension.get(extension);

    if (byExtension) {
      return byExtension;
    }

    throw new Error(`No Tree-sitter adapter registered for file: ${filePath}`);
  }

  private registerAdapter(adapter: BaseTreeSitterLanguageAdapter): void {
    this.adaptersById.set(adapter.id, adapter);

    for (const extension of adapter.extensions) {
      this.adaptersByExtension.set(extension.toLowerCase(), adapter);
    }
  }
}

export const treeSitterService = new TreeSitterService({
  adapters: [swiftAdapter, pythonAdapter],
});
