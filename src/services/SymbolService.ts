import {
  Symbol,
  CreateSymbolInput,
  SymbolQueryResult,
} from "../models/index.js";

/**
 * Handles CRUD and semantic search for symbols.
 * DB and embedding integration is left to the implementation phase.
 */
export const SymbolService = {
  /**
   * Semantic search: embed the query and find the closest symbols via pgvector.
   *
   * @param query - Natural-language description of the logic bit to find.
   * @param limit - Maximum number of results to return.
   * @param repositoryId - Optional filter to a specific repository.
   */
  async query(
    _query: string,
    _limit: number,
    _repositoryId?: string
  ): Promise<SymbolQueryResult[]> {
    throw new Error("Not implemented");
  },

  /**
   * Insert or update a symbol identified by (repositoryId, symbol, file).
   */
  async upsert(_input: CreateSymbolInput): Promise<Symbol> {
    throw new Error("Not implemented");
  },

  /**
   * Retrieve a single symbol by its primary key.
   */
  async get(_id: string): Promise<Symbol | null> {
    throw new Error("Not implemented");
  },

  /**
   * Permanently delete a symbol by its primary key.
   */
  async delete(_id: string): Promise<void> {
    throw new Error("Not implemented");
  },
};
