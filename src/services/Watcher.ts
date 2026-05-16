import chokidar from "chokidar";
import { IgnoreFilter } from "./util/IgnoreFilter.js";
import {
  repositoryPathService,
  type RepositoryPathServicePort,
} from "./util/RepositoryPathService.js";
import { createLogger } from "./util/Logger.js";

type IgnoreFilterInstance = ReturnType<typeof IgnoreFilter.createFilter>;
const logger = createLogger({ component: "watcher" });

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
      logger.warn({ repositoryId }, "Watcher already active");
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
        const relativePath = pathService.toRepositoryRelativePath(
          rootPath,
          fullPath,
        );
        logger.debug({ repositoryId, relativePath }, "File created");
        onCreation(relativePath);
      });
      watcher.on("change", (fullPath: string) => {
        const relativePath = pathService.toRepositoryRelativePath(
          rootPath,
          fullPath,
        );
        logger.debug({ repositoryId, relativePath }, "File changed");
        onUpdate(relativePath);
      });
      watcher.on("unlink", (fullPath: string) => {
        const relativePath = pathService.toRepositoryRelativePath(
          rootPath,
          fullPath,
        );
        logger.debug({ repositoryId, relativePath }, "File deleted");
        onDeletion(relativePath);
      });

      await new Promise<void>((resolve, reject) => {
        watcher.once("ready", () => resolve());
        watcher.once("error", (error) => reject(error));
      });

      // Store the watcher for later cleanup
      this.activeWatchers.set(repositoryId, watcher);

      logger.info({ repositoryId, rootPath }, "Watcher started");
    } catch (error) {
      logger.error(
        { err: error, repositoryId, rootPath },
        "Failed to start watcher",
      );
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
      logger.debug({ repositoryId }, "No active watcher to stop");
      return;
    }

    try {
      await watcher.close();
      this.activeWatchers.delete(repositoryId);
      logger.info({ repositoryId }, "Watcher stopped");
    } catch (error) {
      logger.error({ err: error, repositoryId }, "Failed to stop watcher");
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
