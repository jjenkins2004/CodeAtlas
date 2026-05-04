import { Repository, CreateRepositoryInput } from "../models/index.js";

/**
 * Handles repository lifecycle: tracking, untracking, and reindexing.
 * Integration with the DB and file-watcher is left to the implementation phase.
 */
export const RepositoryService = {
  /**
   * Begin tracking a new repository.
   * Validates that the path is not already tracked before inserting.
   */
  async track(_input: CreateRepositoryInput): Promise<Repository> {
    throw new Error("Not implemented");
  },

  /**
   * Return all tracked repositories.
   */
  async list(): Promise<Repository[]> {
    throw new Error("Not implemented");
  },

  /**
   * Return a single repository by ID, or null if not found.
   */
  async get(_id: string): Promise<Repository | null> {
    throw new Error("Not implemented");
  },

  /**
   * Stop tracking a repository.
   * @param id - Repository ID.
   * @param deleteSymbols - When true, also removes all indexed symbols for this repo.
   */
  async untrack(_id: string, _deleteSymbols: boolean): Promise<void> {
    throw new Error("Not implemented");
  },

  /**
   * Trigger a reindex of the repository (or a sub-path within it).
   * Crawls files respecting .gitignore, extracts symbols via tree-sitter,
   * and upserts them into the database.
   *
   * @param id - Repository ID.
   * @param subpath - Optional relative sub-path to limit the crawl scope.
   */
  async reindex(_id: string, _subpath?: string): Promise<void> {
    throw new Error("Not implemented");
  },
};
