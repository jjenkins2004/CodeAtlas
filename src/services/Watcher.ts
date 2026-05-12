import chokidar from "chokidar";
import path from "path";
import { IgnoreFilter } from "./util/IgnoreFilter.js";

type IgnoreFilterInstance = ReturnType<typeof IgnoreFilter.createFilter>;

/**
 * Watches a repository directory for file changes and triggers incremental
 * reindexing. Uses chokidar and respects .gitignore patterns.
 */

export interface WatcherConfig {
  repositoryId: string;
  rootPath: string;
  onCreation: (filePath: string) => void;
  onUpdate: (filePath: string) => void;
  onDeletion: (filePath: string) => void;
  ignoreFilter?: IgnoreFilterInstance;
}

export interface WatcherPort {
  start(config: WatcherConfig): Promise<void>;
  stop(repositoryId: string): Promise<void>;
  stopAll(): Promise<void>;
}

export class Watcher implements WatcherPort {
  private activeWatchers: Map<string, chokidar.FSWatcher>;

  constructor() {
    this.activeWatchers = new Map();
  }

  /**
   * Start watching a repository directory.
   */
  async start(config: WatcherConfig): Promise<void> {
    const {
      repositoryId,
      rootPath,
      onCreation,
      onUpdate,
      onDeletion,
      ignoreFilter: providedFilter,
    } = config;

    if (this.activeWatchers.has(repositoryId)) {
      console.warn(`Watcher already active for repository ${repositoryId}`);
      return;
    }

    const ignoreFilter = providedFilter ?? IgnoreFilter.createFilter(rootPath);

    // Filter function to determine if a file should be watched
    const shouldWatch = (filePath: string): boolean => {
      const relativePath = path.relative(rootPath, filePath);

      // Chokidar may invoke `ignored` with the watch root itself.
      // The ignore package throws on empty paths, so keep the root watchable.
      if (!relativePath || relativePath === ".") {
        return true;
      }

      return !ignoreFilter.ignores(relativePath);
    };

    try {
      const watcher = chokidar.watch(rootPath, {
        ignored: (filePath: string) => !shouldWatch(filePath),
        persistent: true,
        ignoreInitial: true,
      });

      watcher.on("add", onCreation);
      watcher.on("change", onUpdate);
      watcher.on("unlink", onDeletion);

      await new Promise<void>((resolve, reject) => {
        watcher.once("ready", () => resolve());
        watcher.once("error", (error) => reject(error));
      });

      // Store the watcher for later cleanup
      this.activeWatchers.set(repositoryId, watcher);

      console.log(
        `Watcher started for repository ${repositoryId} at ${rootPath}`,
      );
    } catch (error) {
      console.error(`Failed to start watcher for ${repositoryId}:`, error);
      throw error;
    }
  }

  /**
   * Stop watching a repository directory.
   *
   * @param repositoryId - ID of the repository to stop watching.
   */
  async stop(repositoryId: string): Promise<void> {
    const watcher = this.activeWatchers.get(repositoryId);
    if (!watcher) {
      console.warn(`No active watcher for repository ${repositoryId}`);
      return;
    }

    try {
      await watcher.close();
      this.activeWatchers.delete(repositoryId);
      console.log(`Watcher stopped for repository ${repositoryId}`);
    } catch (error) {
      console.error(`Failed to stop watcher for ${repositoryId}:`, error);
      throw error;
    }
  }

  /**
   * Stop all active watchers.
   */
  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.activeWatchers.keys()).map(
      (repositoryId) => this.stop(repositoryId),
    );
    await Promise.all(stopPromises);
  }
}
