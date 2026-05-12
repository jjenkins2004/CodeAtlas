import { and, eq, sql } from "drizzle-orm";
import { client } from "../client.js";
import { files } from "../schema.js";
import { isUniqueConstraintError } from "../utils.js";
import type {
  CreateFileInput,
  File,
  UpdateFileInput,
} from "../../models/File.js";
import { BaseDBService } from "./base.js";

export interface FileDBServicePort {
  listFiles(): Promise<File[]>;
  getFile(id: string): Promise<File | null>;
  /**
   * Returns the tracked file for a repository-relative path.
   */
  getFileByRepositoryAndPath(
    repositoryId: string,
    repositoryRelativePath: string,
  ): Promise<File | null>;
  createFile(input: CreateFileInput): Promise<File>;
  updateFile(id: string, input: UpdateFileInput): Promise<File | null>;
  removeFile(id: string): Promise<boolean>;
}

export class DuplicateFileError extends Error {
  readonly repositoryId: string;

  readonly path: string;

  constructor(repositoryId: string, path: string) {
    super(`File already tracked for repository ${repositoryId}: ${path}`);
    this.name = "DuplicateFileError";
    this.repositoryId = repositoryId;
    this.path = path;
  }
}

export class FileDBService extends BaseDBService implements FileDBServicePort {
  async listFiles(): Promise<File[]> {
    return this.executeQuery("listFiles", async () => {
      return this.db.select().from(files);
    });
  }

  async getFile(id: string): Promise<File | null> {
    return this.executeQuery("getFile", async () => {
      const [file] = await this.db.select().from(files).where(eq(files.id, id));

      return file ?? null;
    });
  }

  async getFileByRepositoryAndPath(
    repositoryId: string,
    repositoryRelativePath: string,
  ): Promise<File | null> {
    return this.executeQuery("getFileByRepositoryAndPath", async () => {
      const [file] = await this.db
        .select()
        .from(files)
        .where(
          and(
            eq(files.repositoryId, repositoryId),
            eq(files.path, repositoryRelativePath),
          ),
        );

      return file ?? null;
    });
  }

  async createFile(input: CreateFileInput): Promise<File> {
    return this.executeQuery("createFile", async () => {
      try {
        const [created] = await this.db
          .insert(files)
          .values({
            repositoryId: input.repositoryId,
            path: input.path,
            hash: input.hash,
          })
          .returning();

        return created;
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new DuplicateFileError(input.repositoryId, input.path);
        }

        throw error;
      }
    });
  }

  async updateFile(id: string, input: UpdateFileInput): Promise<File | null> {
    return this.executeQuery("updateFile", async () => {
      const [updated] = await this.db
        .update(files)
        .set({
          ...(input.repositoryId !== undefined
            ? { repositoryId: input.repositoryId }
            : {}),
          ...(input.path !== undefined ? { path: input.path } : {}),
          ...(input.hash !== undefined ? { hash: input.hash } : {}),
          updatedAt: sql`now()`,
        })
        .where(eq(files.id, id))
        .returning();

      return updated ?? null;
    });
  }

  async removeFile(id: string): Promise<boolean> {
    return this.executeQuery("removeFile", async () => {
      const deleted = await this.db
        .delete(files)
        .where(eq(files.id, id))
        .returning();

      return deleted.length > 0;
    });
  }
}

export const fileDBService = new FileDBService(client.getDatabase());
