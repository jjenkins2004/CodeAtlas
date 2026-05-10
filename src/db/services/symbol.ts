import { eq, sql } from "drizzle-orm";
import { client } from "../client.js";
import { symbols } from "../schema.js";
import type {
  CreateSymbolInput,
  Symbol,
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
          target: [symbols.repositoryId, symbols.symbol, symbols.file],
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
          ...(input.file !== undefined ? { file: input.file } : {}),
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
