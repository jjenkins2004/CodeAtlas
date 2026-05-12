import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  HasherService,
  hashCodeBlock,
  hashFile,
  hashText,
} from "../../services/Hasher.js";
import { MockRepo } from "../fixtures/mockRepo.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HasherService", () => {
  let repo: MockRepo;

  beforeEach(() => {
    repo = new MockRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  // ---------------------------------------------------------------------------
  // exposed APIs
  // ---------------------------------------------------------------------------

  describe("exposed APIs", () => {
    it("returns stable hashes for the same text input", () => {
      const service = new HasherService();

      const first = service.hashText("export const value = 1;");
      const second = service.hashText("export const value = 1;");

      expect(first).toBe(second);
      expect(first).toHaveLength(64);
    });

    it("returns different hashes when the text changes", () => {
      const service = new HasherService();

      const first = service.hashText("export const value = 1;");
      const second = service.hashText("export const value = 2;");

      expect(first).not.toBe(second);
    });

    it("hashes a file using its raw contents", async () => {
      const service = new HasherService();
      repo.writeFile("src/example.ts", "export const answer = 42;\n");

      const fileHash = await service.hashFile(repo.resolve("src/example.ts"));

      expect(fileHash).toBe(service.hashText("export const answer = 42;\n"));
    });

    it("treats code blocks as plain text for hashing", () => {
      const service = new HasherService();
      const codeBlock = "function greet(name: string) { return `hi ${name}`; }";

      expect(service.hashCodeBlock(codeBlock)).toBe(
        service.hashText(codeBlock),
      );
    });

    it("exposes module-level helper functions", async () => {
      repo.writeFile("src/helper.ts", "export const helper = true;\n");

      const service = new HasherService();

      expect(hashText("alpha")).toBe(service.hashText("alpha"));
      expect(hashCodeBlock("beta")).toBe(service.hashText("beta"));
      await expect(hashFile(repo.resolve("src/helper.ts"))).resolves.toBe(
        service.hashText("export const helper = true;\n"),
      );
    });
  });
});
