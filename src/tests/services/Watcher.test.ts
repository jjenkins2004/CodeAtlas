import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { Watcher, WatcherConfig } from "../../services/Watcher.js";
import { MockRepo } from "../fixtures/mockRepo.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a promise that resolves with the first value passed to `fn` once
 * it is called, or rejects after `timeoutMs` milliseconds.
 */
function waitForCall(
  fn: ReturnType<typeof vi.fn>,
  timeoutMs = 3000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timed out waiting for watcher event")),
      timeoutMs,
    );
    fn.mockImplementationOnce((filePath: string) => {
      clearTimeout(timer);
      resolve(filePath);
    });
  });
}

function makeConfig(
  repo: MockRepo,
  overrides: Partial<WatcherConfig> = {},
): WatcherConfig {
  return {
    repositoryId: "test-repo",
    rootPath: repo.rootPath,
    onCreation: vi.fn(),
    onUpdate: vi.fn(),
    onDeletion: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Watcher", () => {
  let repo: MockRepo;
  let watcher: Watcher;

  beforeEach(() => {
    repo = new MockRepo();
    watcher = new Watcher();
  });

  afterEach(async () => {
    await watcher.stopAll();
    repo.cleanup();
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // start()
  // ---------------------------------------------------------------------------

  describe("start()", () => {
    it("fires onCreation when a new source file is added", async () => {
      const config = makeConfig(repo);
      await watcher.start(config);

      const received = waitForCall(
        config.onCreation as ReturnType<typeof vi.fn>,
      );
      repo.writeFile("src/newFile.ts", "export {}");

      expect(await received).toBe(repo.resolve("src/newFile.ts"));
    });

    it("fires onUpdate when an existing source file is changed", async () => {
      const config = makeConfig(repo);
      await watcher.start(config);

      const received = waitForCall(config.onUpdate as ReturnType<typeof vi.fn>);
      repo.appendToFile("src/index.ts", "\nexport const updated = true;");

      expect(await received).toBe(repo.resolve("src/index.ts"));
    });

    it("fires onDeletion when a source file is removed", async () => {
      const config = makeConfig(repo);
      await watcher.start(config);

      const received = waitForCall(
        config.onDeletion as ReturnType<typeof vi.fn>,
      );
      repo.deleteFile("src/index.ts");

      expect(await received).toBe(repo.resolve("src/index.ts"));
    });

    it("does not fire onCreation for ignored paths (node_modules)", async () => {
      const config = makeConfig(repo);
      await watcher.start(config);

      repo.writeFile("node_modules/some-pkg/index.js", "");

      // Give chokidar a moment — event must NOT arrive
      await new Promise((r) => setTimeout(r, 500));
      expect(config.onCreation).not.toHaveBeenCalled();
    });

    it("does not fire onCreation for paths ignored by .gitignore", async () => {
      const config = makeConfig(repo);
      await watcher.start(config);

      repo.writeFile("ignored-by-gitignore/new.ts", "");

      await new Promise((r) => setTimeout(r, 500));
      expect(config.onCreation).not.toHaveBeenCalled();
    });

    it("uses a provided ignoreFilter instead of creating one from the root", async () => {
      // Supply a filter that ignores everything — no events should fire
      const { IgnoreFilter } = await import("../../services/IgnoreFilter.js");
      const blockAll = IgnoreFilter.createFilter(repo.rootPath);
      vi.spyOn(blockAll, "ignores").mockReturnValue(true);

      const config = makeConfig(repo, { ignoreFilter: blockAll });
      await watcher.start(config);

      repo.writeFile("src/newFile.ts", "export {}");

      await new Promise((r) => setTimeout(r, 500));
      expect(config.onCreation).not.toHaveBeenCalled();
    });

    it("warns and does not start a second watcher for the same repositoryId", async () => {
      const config = makeConfig(repo);

      await watcher.start(config);
      await watcher.start(config);

      const received = waitForCall(
        config.onCreation as ReturnType<typeof vi.fn>,
      );
      repo.writeFile("src/duplicate-watch-check.ts", "export {}");
      expect(await received).toBe(repo.resolve("src/duplicate-watch-check.ts"));

      // If a second watcher had been created for the same repositoryId,
      // this callback would have been invoked twice for one file add.
      await new Promise((r) => setTimeout(r, 500));
      expect(config.onCreation).toHaveBeenCalledTimes(1);

      // Only one watcher is registered — stopping once cleans up fully
      await watcher.stop("test-repo");
      await expect(watcher.stopAll()).resolves.toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // stop()
  // ---------------------------------------------------------------------------

  describe("stop()", () => {
    it("stops the watcher so no further events are received", async () => {
      const config = makeConfig(repo);
      await watcher.start(config);
      await watcher.stop("test-repo");

      repo.writeFile("src/afterStop.ts", "export {}");

      await new Promise((r) => setTimeout(r, 500));
      expect(config.onCreation).not.toHaveBeenCalled();
    });

    it("returns early if no watcher is registered", async () => {
      await expect(watcher.stop("nonexistent-repo")).resolves.toBeUndefined();

      // Service should still function normally after a no-op stop call.
      const config = makeConfig(repo);
      await watcher.start(config);

      const received = waitForCall(
        config.onCreation as ReturnType<typeof vi.fn>,
      );
      repo.writeFile("src/post-noop-stop.ts", "export {}");
      expect(await received).toBe(repo.resolve("src/post-noop-stop.ts"));
    });

    it("allows the same repositoryId to be re-watched after stop", async () => {
      const config = makeConfig(repo);
      await watcher.start(config);
      await watcher.stop("test-repo");

      const config2 = makeConfig(repo);
      await expect(watcher.start(config2)).resolves.toBeUndefined();

      const received = waitForCall(
        config2.onCreation as ReturnType<typeof vi.fn>,
      );
      repo.writeFile("src/rewatch.ts", "export {}");
      expect(await received).toBe(repo.resolve("src/rewatch.ts"));
    });
  });

  // ---------------------------------------------------------------------------
  // stopAll()
  // ---------------------------------------------------------------------------

  describe("stopAll()", () => {
    it("stops all active watchers", async () => {
      const repoB = new MockRepo();

      const configA = makeConfig(repo, { repositoryId: "repo-a" });
      const configB = makeConfig(repoB, { repositoryId: "repo-b" });

      await watcher.start(configA);
      await watcher.start(configB);
      await watcher.stopAll();

      repo.writeFile("src/afterStop.ts", "export {}");
      repoB.writeFile("src/afterStop.ts", "export {}");

      await new Promise((r) => setTimeout(r, 500));
      expect(configA.onCreation).not.toHaveBeenCalled();
      expect(configB.onCreation).not.toHaveBeenCalled();

      repoB.cleanup();
    });

    it("resolves without error when there are no active watchers", async () => {
      await expect(watcher.stopAll()).resolves.toBeUndefined();
    });
  });
});
