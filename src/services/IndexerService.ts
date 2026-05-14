import type { CreateSymbolInput } from "../models/Symbol.js";

export interface IndexerServicePort {
  /** Indexes a single symbol record for a repository. */
  indexSymbol(symbol: CreateSymbolInput): Promise<void>;
}

export class IndexerService implements IndexerServicePort {
  /** Indexes a single symbol record for a repository. */
  async indexSymbol(_symbol: CreateSymbolInput): Promise<void> {
    throw new Error("Symbol indexing is not implemented yet");
  }
}

export const indexerService = new IndexerService();

/** Indexes a single symbol record for a repository. */
export const indexSymbol = (symbol: CreateSymbolInput): Promise<void> =>
  indexerService.indexSymbol(symbol);
