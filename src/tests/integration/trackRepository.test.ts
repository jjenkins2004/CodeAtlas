import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MockRepo } from "../fixtures/mockRepo.js";
import { createTestDb, type TestDbContext } from "../fixtures/testDb.js";
import {
  createIntegrationServices,
  type IntegrationServices,
} from "./fixtures/integrationServices.js";
import { MOCK_SEMANTIC, MOCK_EMBEDDING } from "./fixtures/mockProviders.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// A minimal Python file with one public function so tree-sitter extracts one symbol.
const PYTHON_ONE_FUNCTION = `\
def greet(name):
    return "Hello, " + name
`;

/**
 * Polls the symbol DB until at least `minCount` symbols exist for the repo, or
 * the timeout is reached. Returns the final symbol list.
 */
async function waitForSymbols(
  services: IntegrationServices,
  repositoryId: string,
  minCount: number,
  timeoutMs = 15000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const symbols =
      await services.symbolDbService.listSymbolsByRepository(repositoryId);
    if (symbols.length >= minCount) return symbols;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(
    `Timed out waiting for ${minCount} symbol(s) for repository ${repositoryId}`,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("trackRepository() integration", () => {
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
  // trackRepository()
  // ---------------------------------------------------------------------------

  describe("trackRepository()", () => {
    it("creates a repository record in the DB", async () => {
      repo.writeFile("src/calculator.py", PYTHON_ONE_FUNCTION);

      const tracked = await services.orchestrator.trackRepository({
        name: "test-repo",
        path: repo.rootPath,
      });

      const repoRecord = await services.repositoryDbService.getRepository(
        tracked.id,
      );
      expect(repoRecord).not.toBeNull();
      expect(repoRecord?.name).toBe("test-repo");
      expect(repoRecord?.path).toBe(repo.rootPath);
    });

    it("creates a file record for each indexed source file", async () => {
      repo.writeFile("src/calculator.py", PYTHON_ONE_FUNCTION);

      const tracked = await services.orchestrator.trackRepository({
        name: "test-repo",
        path: repo.rootPath,
      });

      const fileRecord =
        await services.fileDbService.getFileByRepositoryAndPath(
          tracked.id,
          "src/calculator.py",
        );
      expect(fileRecord).not.toBeNull();
      expect(fileRecord?.hash).toBeTruthy();
    });

    it("persists symbol records with LLM-generated semantic fields and an embedding", async () => {
      repo.writeFile("src/calculator.py", PYTHON_ONE_FUNCTION);

      const tracked = await services.orchestrator.trackRepository({
        name: "test-repo",
        path: repo.rootPath,
      });

      const symbols = await services.symbolDbService.listSymbolsByRepository(
        tracked.id,
      );

      expect(symbols.length).toBeGreaterThan(0);
      const sym = symbols[0]!;
      expect(sym.symbol).toBe("greet");
      expect(sym.type).toBe("function");
      expect(sym.blurb).toBe(MOCK_SEMANTIC.blurb);
      expect(sym.implementation).toBe(MOCK_SEMANTIC.implementation);
      expect(sym.tags).toEqual(MOCK_SEMANTIC.tags);
      expect(sym.embedding).toHaveLength(MOCK_EMBEDDING.length);
    });
  });

  // ---------------------------------------------------------------------------
  // untrackRepository()
  // ---------------------------------------------------------------------------

  describe("untrackRepository()", () => {
    it("removes the repository record and all linked file and symbol records", async () => {
      repo.writeFile("src/calculator.py", PYTHON_ONE_FUNCTION);

      const tracked = await services.orchestrator.trackRepository({
        name: "test-repo",
        path: repo.rootPath,
      });

      // Verify initial state
      const initialSymbols =
        await services.symbolDbService.listSymbolsByRepository(tracked.id);
      expect(initialSymbols.length).toBeGreaterThan(0);

      await services.orchestrator.untrackRepository(tracked.id);

      const repoRecord = await services.repositoryDbService.getRepository(
        tracked.id,
      );
      expect(repoRecord).toBeNull();

      const remainingSymbols =
        await services.symbolDbService.listSymbolsByRepository(tracked.id);
      expect(remainingSymbols).toHaveLength(0);
    });

    it("stops the watcher so new file writes no longer produce symbols", async () => {
      repo.writeFile("src/calculator.py", PYTHON_ONE_FUNCTION);

      const tracked = await services.orchestrator.trackRepository({
        name: "test-repo",
        path: repo.rootPath,
      });

      await services.orchestrator.untrackRepository(tracked.id);

      // Write a new file — watcher is stopped so no events should fire
      repo.writeFile("src/new.py", PYTHON_ONE_FUNCTION);

      // Give the (now-stopped) pipeline a moment to confirm nothing runs
      await new Promise((r) => setTimeout(r, 300));

      const symbolsAfterUntrack =
        await services.symbolDbService.listSymbolsByRepository(tracked.id);
      expect(symbolsAfterUntrack).toHaveLength(0);
    });
  });
});
