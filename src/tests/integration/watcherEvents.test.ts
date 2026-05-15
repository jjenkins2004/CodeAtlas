import fs from "fs";
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

const PYTHON_ONE_FUNCTION_V2 = `\
def greet(name):
    return "Hi there, " + name
`;

// A Python file with a syntax error that causes tree-sitter ERROR nodes
// (missing closing parenthesis in the parameter list).
const PYTHON_BROKEN_SYNTAX = `\
def greet(name
    return "Hello"
`;

/**
 * Polls until at least `minCount` symbols exist for the repository, or the
 * timeout elapses.
 */
async function waitForSymbols(
  services: IntegrationServices,
  repositoryId: string,
  minCount: number,
  timeoutMs = 15000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const syms =
      await services.symbolDbService.listSymbolsByRepository(repositoryId);
    if (syms.length >= minCount) return syms;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(
    `Timed out waiting for ${minCount} symbol(s) for repository ${repositoryId}`,
  );
}

/**
 * Polls until 0 symbols remain for the repository, or the timeout elapses.
 */
async function waitForNoSymbols(
  services: IntegrationServices,
  repositoryId: string,
  timeoutMs = 15000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const syms =
      await services.symbolDbService.listSymbolsByRepository(repositoryId);
    if (syms.length === 0) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(
    `Timed out waiting for symbols to be removed for repository ${repositoryId}`,
  );
}

/**
 * Polls until the mock spy's call count exceeds `prevCount`, or the timeout
 * elapses. Useful for confirming that a fire-and-forget async step ran.
 */
async function waitForCall(
  spy: { mock: { calls: unknown[] } },
  prevCount: number,
  timeoutMs = 15000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (spy.mock.calls.length > prevCount) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Timed out waiting for spy to be called");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("watcher event integration", () => {
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
  // add event
  // ---------------------------------------------------------------------------

  describe("add event", () => {
    it("indexes a new source file and creates symbol records", async () => {
      // Start with an empty repo (no Python functions in defaults)
      const tracked = await services.orchestrator.trackRepository({
        name: "test-repo",
        path: repo.rootPath,
      });

      const initialSymbols =
        await services.symbolDbService.listSymbolsByRepository(tracked.id);
      expect(initialSymbols).toHaveLength(0);

      // Add a new Python file after the watcher is already running
      repo.writeFile("src/calculator.py", PYTHON_ONE_FUNCTION);

      const symbols = await waitForSymbols(services, tracked.id, 1);
      expect(symbols.length).toBeGreaterThan(0);
      expect(symbols[0]?.symbol).toBe("greet");
    });

    it("creates a file record for the new file", async () => {
      const tracked = await services.orchestrator.trackRepository({
        name: "test-repo",
        path: repo.rootPath,
      });

      repo.writeFile("src/calculator.py", PYTHON_ONE_FUNCTION);

      await waitForSymbols(services, tracked.id, 1);

      const fileRecord =
        await services.fileDbService.getFileByRepositoryAndPath(
          tracked.id,
          "src/calculator.py",
        );
      expect(fileRecord).not.toBeNull();
      expect(fileRecord?.hash).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // change event — content changed
  // ---------------------------------------------------------------------------

  describe("change event (content changed)", () => {
    it("updates the symbol record when file content changes", async () => {
      repo.writeFile("src/calculator.py", PYTHON_ONE_FUNCTION);

      const tracked = await services.orchestrator.trackRepository({
        name: "test-repo",
        path: repo.rootPath,
      });

      await waitForSymbols(services, tracked.id, 1);

      const initialSymbols =
        await services.symbolDbService.listSymbolsByRepository(tracked.id);
      const initialUpdatedAt = initialSymbols[0]?.updatedAt;
      const llmCallsBefore =
        services.mockLLM.promptForStructuredJson.mock.calls.length;

      // Overwrite with different content
      repo.writeFile("src/calculator.py", PYTHON_ONE_FUNCTION_V2);

      // Wait for the LLM to be called again (signals the full pipeline ran)
      await waitForCall(
        services.mockLLM.promptForStructuredJson,
        llmCallsBefore,
      );

      const updatedSymbols =
        await services.symbolDbService.listSymbolsByRepository(tracked.id);
      expect(updatedSymbols).toHaveLength(initialSymbols.length);
      expect(updatedSymbols[0]?.updatedAt).not.toBe(initialUpdatedAt);
    });

    it("does not duplicate symbol rows when re-indexing", async () => {
      repo.writeFile("src/calculator.py", PYTHON_ONE_FUNCTION);

      const tracked = await services.orchestrator.trackRepository({
        name: "test-repo",
        path: repo.rootPath,
      });

      await waitForSymbols(services, tracked.id, 1);

      const initialCount = (
        await services.symbolDbService.listSymbolsByRepository(tracked.id)
      ).length;

      const llmCallsBefore =
        services.mockLLM.promptForStructuredJson.mock.calls.length;
      repo.writeFile("src/calculator.py", PYTHON_ONE_FUNCTION_V2);
      await waitForCall(
        services.mockLLM.promptForStructuredJson,
        llmCallsBefore,
      );

      const updatedCount = (
        await services.symbolDbService.listSymbolsByRepository(tracked.id)
      ).length;
      expect(updatedCount).toBe(initialCount);
    });
  });

  // ---------------------------------------------------------------------------
  // change event — content unchanged (hash gate)
  // ---------------------------------------------------------------------------

  describe("change event (content unchanged — hash gate)", () => {
    it("does not call the LLM again when the file bytes have not changed", async () => {
      repo.writeFile("src/calculator.py", PYTHON_ONE_FUNCTION);

      const tracked = await services.orchestrator.trackRepository({
        name: "test-repo",
        path: repo.rootPath,
      });

      await waitForSymbols(services, tracked.id, 1);

      const llmCallsAfterInit =
        services.mockLLM.promptForStructuredJson.mock.calls.length;
      expect(llmCallsAfterInit).toBeGreaterThan(0);

      // Write the exact same bytes — chokidar fires "change" but hash won't differ
      repo.writeFile("src/calculator.py", PYTHON_ONE_FUNCTION);

      // Give the debounce pipeline enough time to flush
      await new Promise((r) => setTimeout(r, 300));

      expect(services.mockLLM.promptForStructuredJson.mock.calls.length).toBe(
        llmCallsAfterInit,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // unlink event
  // ---------------------------------------------------------------------------

  describe("unlink event", () => {
    it("removes file and symbol records when the source file is deleted", async () => {
      repo.writeFile("src/calculator.py", PYTHON_ONE_FUNCTION);

      const tracked = await services.orchestrator.trackRepository({
        name: "test-repo",
        path: repo.rootPath,
      });

      const initialSymbols =
        await services.symbolDbService.listSymbolsByRepository(tracked.id);
      expect(initialSymbols.length).toBeGreaterThan(0);

      // Delete the file from disk — watcher fires "unlink"
      fs.unlinkSync(repo.resolve("src/calculator.py"));

      await waitForNoSymbols(services, tracked.id);

      const fileRecord =
        await services.fileDbService.getFileByRepositoryAndPath(
          tracked.id,
          "src/calculator.py",
        );
      expect(fileRecord).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // syntax gate
  // ---------------------------------------------------------------------------

  describe("syntax gate", () => {
    it("skips a file with parse errors and indexes it once the syntax is valid", async () => {
      // Start with broken Python — tree-sitter should reject the symbol
      repo.writeFile("src/calculator.py", PYTHON_BROKEN_SYNTAX);

      const tracked = await services.orchestrator.trackRepository({
        name: "test-repo",
        path: repo.rootPath,
      });

      // Initial crawl should produce no symbols for the broken file
      const initialSymbols =
        await services.symbolDbService.listSymbolsByRepository(tracked.id);
      expect(initialSymbols).toHaveLength(0);

      // Fix the file — watcher fires "change"
      repo.writeFile("src/calculator.py", PYTHON_ONE_FUNCTION);

      // Now symbols should appear once the pipeline processes the valid file
      const symbols = await waitForSymbols(services, tracked.id, 1);
      expect(symbols.length).toBeGreaterThan(0);
    });
  });
});
