/**
 * Watches a repository directory for file changes and triggers incremental
 * reindexing. Uses chokidar and respects .gitignore patterns.
 * Watcher lifecycle and event handling is left to the implementation phase.
 */
export const Watcher = {
  /**
   * Start watching a repository directory.
   *
   * @param repositoryId - ID of the repository to associate changes with.
   * @param rootPath - Absolute path to the repository root.
   */
  async start(_repositoryId: string, _rootPath: string): Promise<void> {
    throw new Error("Not implemented");
  },

  /**
   * Stop watching a repository directory.
   *
   * @param repositoryId - ID of the repository to stop watching.
   */
  async stop(_repositoryId: string): Promise<void> {
    throw new Error("Not implemented");
  },

  /**
   * Stop all active watchers.
   */
  async stopAll(): Promise<void> {
    throw new Error("Not implemented");
  },
};
