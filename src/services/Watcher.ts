import chokidar from "chokidar";
import { IgnoreFilter } from "./util/IgnoreFilter.js";
import {
  repositoryPathService,
  type RepositoryPathServicePort,
} from "./util/RepositoryPathService.js";

type IgnoreFilterInstance = ReturnType<typeof IgnoreFilter.createFilter>;

/**
 * Watches a repository directory for file changes and triggers incremental
 * reindexing. Uses chokidar and respects .gitignore patterns.
 */

export interface WatcherConfig {
  repositoryId: string;
  rootPath: string;
  onCreation: (relativePath: string) => void;
  onUpdate: (relativePath: string) => void;
  onDeletion: (relativePath: string) => void;
  ignoreFilter?: IgnoreFilterInstance;
  repositoryPathService?: RepositoryPathServicePort;
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
      repositoryPathService: providedRepositoryPathService,
    } = config;

    if (this.activeWatchers.has(repositoryId)) {
      console.warn(`Watcher already active for repository ${repositoryId}`);
      return;
    }

    const ignoreFilter = providedFilter ?? IgnoreFilter.createFilter(rootPath);
    const pathService = providedRepositoryPathService ?? repositoryPathService;

    // Filter function to determine if a file should be watched
    const shouldWatch = (fullPath: string): boolean => {
      const relativePath = pathService.toRepositoryRelativePath(
        rootPath,
        fullPath,
      );

      // Chokidar may invoke `ignored` with the watch root itself.
      // The ignore package throws on empty paths, so keep the root watchable.
      if (!relativePath || relativePath === ".") {
        return true;
      }

      return !ignoreFilter.ignores(relativePath);
    };

    try {
      const watcher = chokidar.watch(rootPath, {
        ignored: (fullPath: string) => !shouldWatch(fullPath),
        persistent: true,
        ignoreInitial: true,
      });

      watcher.on("add", (fullPath: string) => {
        onCreation(pathService.toRepositoryRelativePath(rootPath, fullPath));
      });
      watcher.on("change", (fullPath: string) => {
        onUpdate(pathService.toRepositoryRelativePath(rootPath, fullPath));
      });
      watcher.on("unlink", (fullPath: string) => {
        onDeletion(pathService.toRepositoryRelativePath(rootPath, fullPath));
      });

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
