import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { vi, describe, it, expect, afterEach } from "vitest";
import { DatabaseClientManager } from "../../db/client.js";
import { resolvePersistentDataDir } from "../../db/utils.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempHomeRoot(): string {
  return mkdtempSync(path.join(os.tmpdir(), "codeatlas-client-"));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DatabaseClientManager", () => {
  let tempHomeRoot: string | null = null;

  afterEach(() => {
    if (tempHomeRoot) {
      rmSync(tempHomeRoot, { recursive: true, force: true });
      tempHomeRoot = null;
    }

    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // create(false)
  // ---------------------------------------------------------------------------

  describe("create(false)", () => {
    it("creates a persistent local database directory and schema", async () => {
      tempHomeRoot = makeTempHomeRoot();

      const homeDirSpy = vi.spyOn(os, "homedir").mockReturnValue(tempHomeRoot);
      const expectedDataDir = resolvePersistentDataDir("CodeAtlas");
      const manager = DatabaseClientManager.create(false);

      await manager.initializeSchema();

      const dirContents = readdirSync(expectedDataDir);

      expect(homeDirSpy).toHaveBeenCalled();
      expect(dirContents.length).toBeGreaterThan(0);

      await manager.close();
    }, 30_000);
  });
});
