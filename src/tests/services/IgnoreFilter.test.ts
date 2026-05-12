import fs from "fs";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { IgnoreFilter } from "../../services/util/IgnoreFilter.js";
import { MockRepo } from "../fixtures/mockRepo.js";

describe("IgnoreFilter", () => {
  let repo: MockRepo;

  beforeEach(() => {
    repo = new MockRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  // ---------------------------------------------------------------------------
  // loadGitignorePatterns
  // ---------------------------------------------------------------------------

  describe("loadGitignorePatterns", () => {
    it("returns an empty array when no .gitignore exists", () => {
      const repo = new MockRepo({ gitignoreLines: [] });
      const patterns = IgnoreFilter.loadGitignorePatterns(repo.rootPath);
      expect(patterns).toEqual([]);
      repo.cleanup();
    });

    it("parses patterns from a real .gitignore file", () => {
      repo.writeFile(".gitignore", "dist/\nbuild/\n*.log\n");
      const patterns = IgnoreFilter.loadGitignorePatterns(repo.rootPath);
      expect(patterns).toContain("dist/");
      expect(patterns).toContain("build/");
      expect(patterns).toContain("*.log");
    });

    it("strips blank lines", () => {
      repo.writeFile(".gitignore", "dist/\n\n\nbuild/\n");
      const patterns = IgnoreFilter.loadGitignorePatterns(repo.rootPath);
      expect(patterns).not.toContain("");
    });

    it("strips comment lines", () => {
      repo.writeFile(".gitignore", "# this is a comment\ndist/\n");
      const patterns = IgnoreFilter.loadGitignorePatterns(repo.rootPath);
      expect(patterns).not.toContain("# this is a comment");
      expect(patterns).toContain("dist/");
    });

    it("returns an empty array and does not throw when the file is unreadable", () => {
      const gitignorePath = repo.resolve(".gitignore");
      fs.chmodSync(gitignorePath, 0o000);

      let patterns: string[] = [];
      expect(() => {
        patterns = IgnoreFilter.loadGitignorePatterns(repo.rootPath);
      }).not.toThrow();
      expect(patterns).toEqual([]);

      // Restore permissions so cleanup() can remove it
      fs.chmodSync(gitignorePath, 0o644);
    });
  });

  // ---------------------------------------------------------------------------
  // createFilter
  // ---------------------------------------------------------------------------

  describe("createFilter", () => {
    describe("NON_CODE_PATTERNS", () => {
      it("ignores a representative set of hardcoded non-code paths", () => {
        const filter = IgnoreFilter.createFilter(repo.rootPath);

        const shouldBeIgnored = [
          "node_modules/lodash/index.js",
          "dist/bundle.js",
          ".git/config",
          ".vscode/settings.json",
          "tsconfig.json",
          "app.config.ts",
          "debug.log",
          ".DS_Store",
          "MyApp.xcodeproj/project.pbxproj",
        ];

        for (const p of shouldBeIgnored) {
          expect(filter.ignores(p), `expected "${p}" to be ignored`).toBe(true);
        }
      });
    });

    describe("source files", () => {
      it("does not ignore valid source files at various nesting levels", () => {
        const filter = IgnoreFilter.createFilter(repo.rootPath);

        const shouldBeIndexed = [
          "src/index.ts",
          "src/utils.ts",
          "src/main.py",
          "README.md",
          "package.json",
        ];

        for (const p of shouldBeIndexed) {
          expect(filter.ignores(p), `expected "${p}" NOT to be ignored`).toBe(
            false,
          );
        }
      });
    });

    describe(".gitignore integration", () => {
      it("respects patterns from the repo's .gitignore", () => {
        const filter = IgnoreFilter.createFilter(repo.rootPath);

        expect(filter.ignores("ignored-by-gitignore/secret.ts")).toBe(true);
      });

      it(".gitignore patterns combine additively with NON_CODE_PATTERNS", () => {
        const filter = IgnoreFilter.createFilter(repo.rootPath);

        // NON_CODE_PATTERNS still apply
        expect(filter.ignores("node_modules/lodash/index.js")).toBe(true);
        // .gitignore pattern also applies
        expect(filter.ignores("ignored-by-gitignore/secret.ts")).toBe(true);
        // unrelated source files still pass through
        expect(filter.ignores("src/index.ts")).toBe(false);
      });

      it("still applies NON_CODE_PATTERNS when no .gitignore is present", () => {
        const repoWithoutGitignore = new MockRepo({ gitignoreLines: [] });
        const filter = IgnoreFilter.createFilter(repoWithoutGitignore.rootPath);

        expect(filter.ignores("node_modules/lodash/index.js")).toBe(true);
        expect(filter.ignores("src/index.ts")).toBe(false);

        repoWithoutGitignore.cleanup();
      });
    });
  });
});
