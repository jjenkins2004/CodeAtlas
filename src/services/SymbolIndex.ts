import type { ExtractedSymbol } from "../models/SymbolExtraction.js";
import type { SymbolSemanticFields } from "../models/Symbol.js";

export interface SymbolIndexServicePort {
  indexSymbol(symbol: ExtractedSymbol): Promise<SymbolSemanticFields>;
}

export class SymbolIndexService implements SymbolIndexServicePort {
  async indexSymbol(_symbol: ExtractedSymbol): Promise<SymbolSemanticFields> {
    throw new Error("Symbol indexing is not implemented yet");
  }
}

export const symbolIndexService = new SymbolIndexService();