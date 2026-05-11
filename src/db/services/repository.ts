import { eq } from "drizzle-orm";
import { client } from "../client.js";
import { repositories } from "../schema.js";
import { isUniqueConstraintError } from "../utils.js";
import type {
  CreateRepositoryInput,
  Repository,
} from "../../models/Repository.js";
import { BaseDBService } from "./base.js";

export interface UpdateRepositoryInput {
  name?: string;
  path?: string;
}

export interface RepositoryDBServicePort {
  listRepositories(): Promise<Repository[]>;
  getRepository(id: string): Promise<Repository | null>;
  createRepository(input: CreateRepositoryInput): Promise<Repository>;
  updateRepository(
    id: string,
    input: UpdateRepositoryInput,
  ): Promise<Repository | null>;
  removeRepository(id: string): Promise<boolean>;
}

export class DuplicateRepositoryError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`Repository already tracked for path: ${path}`);
    this.name = "DuplicateRepositoryError";
    this.path = path;
  }
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
          throw new DuplicateRepositoryError(input.path);
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
