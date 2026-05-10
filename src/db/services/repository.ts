import { eq } from "drizzle-orm";
import { z } from "zod";
import { client } from "../client.js";
import { repositories } from "../schema.js";
import type {
  CreateRepositoryInput,
  Repository,
} from "../../models/Repository.js";
import { BaseDBService } from "./base.js";

export interface UpdateRepositoryInput {
  name?: string;
  path?: string;
}

const repositoryIdSchema = z.string().uuid();

function assertRequiredNonEmptyString(
  value: string | undefined,
  fieldName: string,
): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Repository ${fieldName} cannot be empty`);
  }
}

function assertOptionalNonEmptyString(
  value: string | undefined,
  fieldName: string,
): void {
  if (value !== undefined && value.length === 0) {
    throw new Error(`Repository ${fieldName} cannot be empty`);
  }
}

function assertValidRepositoryId(id: string): void {
  if (!repositoryIdSchema.safeParse(id).success) {
    throw new Error("Repository id must be a valid UUID");
  }
}

function assertUpdateInput(input: UpdateRepositoryInput): void {
  if (input.name === undefined && input.path === undefined) {
    throw new Error("Repository update requires at least one field");
  }

  assertOptionalNonEmptyString(input.name, "name");
  assertOptionalNonEmptyString(input.path, "path");
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

function throwRepositoryPathConflict(error: unknown): never {
  if (isUniqueConstraintError(error)) {
    throw new Error("Repository path already exists");
  }

  throw error;
}

export class RepositoryDBService extends BaseDBService {
  async createRepository(input: CreateRepositoryInput): Promise<Repository> {
    assertRequiredNonEmptyString(input.name, "name");
    assertRequiredNonEmptyString(input.path, "path");

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
        throwRepositoryPathConflict(error);
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
    assertValidRepositoryId(id);
    assertUpdateInput(input);

    return this.executeQuery("updateRepository", async () => {
      try {
        const [updated] = await this.db
          .update(repositories)
          .set({
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.path !== undefined ? { path: input.path } : {}),
          })
          .where(eq(repositories.id, id))
          .returning();

        return updated ?? null;
      } catch (error) {
        throwRepositoryPathConflict(error);
      }
    });
  }

  async removeRepository(id: string): Promise<boolean> {
    assertValidRepositoryId(id);

    return this.executeQuery("removeRepository", async () => {
      const deleted = await this.db
        .delete(repositories)
        .where(eq(repositories.id, id))
        .returning({ id: repositories.id });

      return deleted.length > 0;
    });
  }
}

export const repositoryDBService = new RepositoryDBService(
  client.getDatabase(),
);
