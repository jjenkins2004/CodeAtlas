import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MockRepo } from "../fixtures/mockRepo.js";
import { createTestDb, type TestDbContext } from "../fixtures/testDb.js";
import {
  createIntegrationServices,
  type IntegrationServices,
} from "./fixtures/integrationServices.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PYTHON_ONE_FUNCTION = `\
def greet(name):
    return "Hello, " + name
`;

/**
 * Polls until at least `minCount` symbols exist for the repository, or the
 * timeout elapses.
 */
async function waitForSymbols(
  services: IntegrationServices,
  repositoryId: string,
  minCount: number,
  timeoutMs = 5000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const syms =
      await services.symbolDbService.listSymbolsByRepository(repositoryId);
    if (syms.length >= minCount) return syms;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(
    `Timed out waiting for ${minCount} symbol(s) for repository ${repositoryId}`,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("startTracking() integration", () => {
  let testDbCtx: TestDbContext;
  let services: IntegrationServices;
  let repo: MockRepo;

  beforeEach(async () => {
    testDbCtx = await createTestDb();
    services = createIntegrationServices(testDbCtx.db);
    repo = new MockRepo();
  });

  afterEach(async () => {
    await services.watcher.stopAll();
    await testDbCtx.cleanup();
    repo.cleanup();
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // startTracking()
  // ---------------------------------------------------------------------------

  describe("startTracking()", () => {
    it("replays all existing files through the update pipeline and indexes their symbols", async () => {
      repo.writeFile("src/calculator.py", PYTHON_ONE_FUNCTION);

      // Pre-register the repository without triggering indexing
      const repoRecord = await services.repositoryDbService.createRepository({
        name: "test-repo",
        path: repo.rootPath,
      });

      // Confirm no symbols yet
      const initialSymbols =
        await services.symbolDbService.listSymbolsByRepository(repoRecord.id);
      expect(initialSymbols).toHaveLength(0);

      // startTracking queues files through the debounce-backed update pipeline
      await services.orchestrator.startTracking("test-repo");

      // Symbols appear once the debounce flushes and the pipeline completes
      const symbols = await waitForSymbols(services, repoRecord.id, 1);
      expect(symbols.length).toBeGreaterThan(0);
      expect(symbols[0]?.symbol).toBe("greet");
    });

    it("reaches the same indexed state as trackRepository for the same file set", async () => {
      repo.writeFile("src/calculator.py", PYTHON_ONE_FUNCTION);

      // Build a reference by tracking a second repo with the same file
      const refRepo = new MockRepo({
        files: [
          { relativePath: "src/calculator.py", content: PYTHON_ONE_FUNCTION },
        ],
      });

      const refTracked = await services.orchestrator.trackRepository({
        name: "ref-repo",
        path: refRepo.rootPath,
      });
      const refSymbols = await services.symbolDbService.listSymbolsByRepository(
        refTracked.id,
      );

      // Now replay the original repo via startTracking
      const repoRecord = await services.repositoryDbService.createRepository({
        name: "test-repo",
        path: repo.rootPath,
      });
      await services.orchestrator.startTracking("test-repo");
      const replayedSymbols = await waitForSymbols(
        services,
        repoRecord.id,
        refSymbols.length,
      );

      // Both repos should have the same number of indexed symbols
      expect(replayedSymbols.length).toBe(refSymbols.length);

      refRepo.cleanup();
    });
  });
});
