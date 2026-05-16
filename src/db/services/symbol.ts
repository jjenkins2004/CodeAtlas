import { and, eq, sql } from "drizzle-orm";
import { client } from "../client.js";
import { symbols } from "../schema.js";
import type {
  CreateSymbolInput,
  Symbol,
  SymbolQueryResult,
  UpdateSymbolInput,
} from "../../models/Symbol.js";
import { BaseDBService } from "./base.js";

type SymbolRecord = typeof symbols.$inferSelect;

function mapSymbol(record: SymbolRecord): Symbol {
  return {
    ...record,
    tags: record.tags ?? [],
  };
}

export class SymbolDBService extends BaseDBService {
  async semanticSearch(
    queryEmbedding: number[],
    limit = 10,
    repositoryId?: string,
  ): Promise<SymbolQueryResult[]> {
    return this.executeQuery("semanticSearch", async () => {
      const queryVectorLiteral = `[${queryEmbedding.join(",")}]`;
      const distanceExpr = sql<number>`(${symbols.embedding} <=> ${queryVectorLiteral}::vector)`;
      const similarityExpr = sql<number>`1 - ${distanceExpr}`;

      const baseSelect = this.db
        .select({
          id: symbols.id,
          repositoryId: symbols.repositoryId,
          symbol: symbols.symbol,
          fileId: symbols.fileId,
          type: symbols.type,
          visibility: symbols.visibility,
          blurb: symbols.blurb,
          tags: symbols.tags,
          score: similarityExpr,
        })
        .from(symbols)
        .orderBy(distanceExpr)
        .limit(limit);

      const records = repositoryId
        ? await baseSelect.where(
            and(
              eq(symbols.repositoryId, repositoryId),
              sql`${symbols.embedding} is not null`,
            ),
          )
        : await baseSelect.where(sql`${symbols.embedding} is not null`);

      return records.map((record) => ({
        ...record,
        tags: record.tags ?? [],
      }));
    });
  }

  async listSymbols(): Promise<Symbol[]> {
    return this.executeQuery("listSymbols", async () => {
      const records = await this.db.select().from(symbols);

      return records.map(mapSymbol);
    });
  }

  async listSymbolsByRepositoryFile(
    repositoryId: string,
    fileId: string,
  ): Promise<Symbol[]> {
    return this.executeQuery("listSymbolsByRepositoryFile", async () => {
      const records = await this.db
        .select()
        .from(symbols)
        .where(
          and(
            eq(symbols.repositoryId, repositoryId),
            eq(symbols.fileId, fileId),
          ),
        );

      return records.map(mapSymbol);
    });
  }

  async listSymbolsByRepository(repositoryId: string): Promise<Symbol[]> {
    return this.executeQuery("listSymbolsByRepository", async () => {
      const records = await this.db
        .select()
        .from(symbols)
        .where(eq(symbols.repositoryId, repositoryId));

      return records.map(mapSymbol);
    });
  }

  async removeSymbolsByRepository(repositoryId: string): Promise<number> {
    return this.executeQuery("removeSymbolsByRepository", async () => {
      const deleted = await this.db
        .delete(symbols)
        .where(eq(symbols.repositoryId, repositoryId))
        .returning({ id: symbols.id });

      return deleted.length;
    });
  }

  async removeSymbolsByRepositoryFile(
    repositoryId: string,
    fileId: string,
  ): Promise<number> {
    return this.executeQuery("removeSymbolsByRepositoryFile", async () => {
      const deleted = await this.db
        .delete(symbols)
        .where(
          and(
            eq(symbols.repositoryId, repositoryId),
            eq(symbols.fileId, fileId),
          ),
        )
        .returning({ id: symbols.id });

      return deleted.length;
    });
  }

  async createSymbol(input: CreateSymbolInput): Promise<Symbol> {
    return this.executeQuery("createSymbol", async () => {
      const [created] = await this.db.insert(symbols).values(input).returning();

      return mapSymbol(created);
    });
  }

  async getSymbol(id: string): Promise<Symbol | null> {
    return this.executeQuery("getSymbol", async () => {
      const [record] = await this.db
        .select()
        .from(symbols)
        .where(eq(symbols.id, id));

      return record ? mapSymbol(record) : null;
    });
  }

  async upsertSymbol(input: CreateSymbolInput): Promise<Symbol> {
    return this.executeQuery("upsertSymbol", async () => {
      const [upserted] = await this.db
        .insert(symbols)
        .values(input)
        .onConflictDoUpdate({
          target: [symbols.repositoryId, symbols.symbol, symbols.fileId],
          set: {
            type: input.type,
            visibility: input.visibility,
            blurb: input.blurb ?? null,
            implementation: input.implementation ?? null,
            tags: input.tags ?? null,
            embedding: input.embedding ?? null,
            updatedAt: sql`now()`,
          },
        })
        .returning();

      return mapSymbol(upserted);
    });
  }

  async updateSymbol(
    id: string,
    input: UpdateSymbolInput,
  ): Promise<Symbol | null> {
    return this.executeQuery("updateSymbol", async () => {
      const [updated] = await this.db
        .update(symbols)
        .set({
          ...(input.symbol !== undefined ? { symbol: input.symbol } : {}),
          ...(input.fileId !== undefined ? { fileId: input.fileId } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.visibility !== undefined
            ? { visibility: input.visibility }
            : {}),
          ...(input.blurb !== undefined ? { blurb: input.blurb } : {}),
          ...(input.implementation !== undefined
            ? { implementation: input.implementation }
            : {}),
          ...(input.tags !== undefined ? { tags: input.tags } : {}),
          ...(input.embedding !== undefined
            ? { embedding: input.embedding }
            : {}),
          updatedAt: sql`now()`,
        })
        .where(eq(symbols.id, id))
        .returning();

      return updated ? mapSymbol(updated) : null;
    });
  }

  async removeSymbol(id: string): Promise<boolean> {
    return this.executeQuery("removeSymbol", async () => {
      const deleted = await this.db
        .delete(symbols)
        .where(eq(symbols.id, id))
        .returning();

      return deleted.length > 0;
    });
  }
}

export const symbolDBService = new SymbolDBService(client.getDatabase());
