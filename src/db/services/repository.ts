import { eq } from "drizzle-orm";
import { client } from "../client.js";
import { repositories } from "../schema.js";
import { isUniqueConstraintError } from "../utils.js";
import type {
  CreateRepositoryInput,
  UpdateRepositoryInput,
  Repository,
} from "../../models/Repository.js";
import { BaseDBService } from "./base.js";

export interface RepositoryDBServicePort {
  listRepositories(): Promise<Repository[]>;
  getRepository(id: string): Promise<Repository | null>;
  getRepositoryByName(name: string): Promise<Repository | null>;
  createRepository(input: CreateRepositoryInput): Promise<Repository>;
  updateRepository(
    id: string,
    input: UpdateRepositoryInput,
  ): Promise<Repository | null>;
  removeRepository(id: string): Promise<boolean>;
}

export class DuplicateRepositoryError extends Error {
  readonly field: "name" | "path";
  readonly value: string;

  constructor(field: "name" | "path", value: string) {
    super(`Repository already tracked for ${field}: ${value}`);
    this.name = "DuplicateRepositoryError";
    this.field = field;
    this.value = value;
  }
}

function getUniqueConstraintName(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  if (
    "code" in error &&
    (error as { code?: string }).code === "23505" &&
    "constraint" in error
  ) {
    const constraint = (error as { constraint?: unknown }).constraint;
    if (typeof constraint === "string") {
      return constraint;
    }
  }

  if ("cause" in error) {
    return getUniqueConstraintName((error as { cause?: unknown }).cause);
  }

  return undefined;
}

export class RepositoryDBService
  extends BaseDBService
  implements RepositoryDBServicePort
{
  async listRepositories(): Promise<Repository[]> {
    return this.executeQuery("listRepositories", async () => {
      return this.db.select().from(repositories);
    });
  }

  async getRepository(id: string): Promise<Repository | null> {
    return this.executeQuery("getRepository", async () => {
      const [repository] = await this.db
        .select()
        .from(repositories)
        .where(eq(repositories.id, id));

      return repository ?? null;
    });
  }

  async getRepositoryByName(name: string): Promise<Repository | null> {
    return this.executeQuery("getRepositoryByName", async () => {
      const [repository] = await this.db
        .select()
        .from(repositories)
        .where(eq(repositories.name, name));

      return repository ?? null;
    });
  }

  async createRepository(input: CreateRepositoryInput): Promise<Repository> {
    return this.executeQuery("createRepository", async () => {
      try {
        const [created] = await this.db
          .insert(repositories)
          .values({
            name: input.name,
            path: input.path,
          })
          .returning();

        return created;
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          const constraintName = getUniqueConstraintName(error);

          if (constraintName === "repositories_name_unique") {
            throw new DuplicateRepositoryError("name", input.name);
          }

          throw new DuplicateRepositoryError("path", input.path);
        }

        throw error;
      }
    });
  }

  /**
   * Updates an existing repository by id.
   *
   * Only provided fields are changed.
   * Returns the updated repository, or null when the id does not exist.
   */
  async updateRepository(
    id: string,
    input: UpdateRepositoryInput,
  ): Promise<Repository | null> {
    return this.executeQuery("updateRepository", async () => {
      const [updated] = await this.db
        .update(repositories)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.path !== undefined ? { path: input.path } : {}),
        })
        .where(eq(repositories.id, id))
        .returning();

      return updated ?? null;
    });
  }

  async removeRepository(id: string): Promise<boolean> {
    return this.executeQuery("removeRepository", async () => {
      const deleted = await this.db
        .delete(repositories)
        .where(eq(repositories.id, id))
        .returning();

      return deleted.length > 0;
    });
  }
}

export const repositoryDBService = new RepositoryDBService(
  client.getDatabase(),
);
