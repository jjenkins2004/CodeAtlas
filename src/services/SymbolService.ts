import { fileDBService } from "../db/services/file.js";
import { symbolDBService } from "../db/services/symbol.js";
import type {
  CreateSymbolInput,
  Symbol,
  SymbolQueryResult,
} from "../models/Symbol.js";
import { hasherService } from "./util/Hasher.js";
import { embeddingService } from "./EmbeddingService.js";
import { createLogger } from "./util/Logger.js";

const logger = createLogger({ component: "symbol-service" });

interface UpsertSymbolInput {
  repositoryId: string;
  symbol: string;
  file: string;
  type?: CreateSymbolInput["type"];
  visibility?: CreateSymbolInput["visibility"];
  blurb?: string;
  implementation?: string;
  tags?: string[];
}

class SymbolApiService {
  async list(repositoryId?: string): Promise<Symbol[]> {
    if (repositoryId) {
      return symbolDBService.listSymbolsByRepository(repositoryId);
    }

    return symbolDBService.listSymbols();
  }

  async query(
    q: string,
    limit = 10,
    repositoryId?: string,
  ): Promise<SymbolQueryResult[]> {
    const normalizedQuery = q.trim();
    if (!normalizedQuery) {
      return [];
    }

    logger.info(
      {
        repositoryId,
        limit,
        queryLength: normalizedQuery.length,
      },
      "Running semantic search",
    );

    const queryEmbedding = await embeddingService.embed(normalizedQuery);

    const results = await symbolDBService.semanticSearch(
      queryEmbedding,
      limit,
      repositoryId,
    );

    logger.info(
      {
        repositoryId,
        limit,
        resultCount: results.length,
      },
      "Semantic search completed",
    );

    return results;
  }

  async upsert(input: UpsertSymbolInput): Promise<Symbol> {
    const fileHash = hasherService.hashCodeBlock(input.file);
    const file = await fileDBService.upsertFile({
      repositoryId: input.repositoryId,
      path: input.file,
      hash: fileHash,
    });

    const symbolHash = hasherService.hashCodeBlock(
      `${input.repositoryId}:${input.symbol}:${input.file}`,
    );

    return symbolDBService.upsertSymbol({
      repositoryId: input.repositoryId,
      symbol: input.symbol,
      fileId: file.id,
      hash: symbolHash,
      type: input.type ?? "function",
      visibility: input.visibility ?? "public",
      blurb: input.blurb,
      implementation: input.implementation,
      tags: input.tags,
    });
  }

  async get(id: string): Promise<Symbol | null> {
    return symbolDBService.getSymbol(id);
  }

  async delete(id: string): Promise<void> {
    await symbolDBService.removeSymbol(id);
  }
}

export const SymbolService = new SymbolApiService();
