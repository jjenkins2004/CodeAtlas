import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RepositoryNotFoundError } from "../../models/Repository.js";
import { createMockRepoDBService } from "../fixtures/mockRepoDBService.js";
import { MockRepo } from "../fixtures/mockRepo.js";
import {
  RepositoryPathService,
  toRepositoryFullPath,
  toRepositoryFullPathByRepositoryId,
  toRepositoryRelativePath,
  walkDirectory,
} from "../../services/util/RepositoryPathService.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RepositoryPathService", () => {
  let repo: MockRepo;

  beforeEach(() => {
    repo = new MockRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  it("converts a full file path to a repository-relative path", () => {
    const service = new RepositoryPathService();

    expect(
      service.toRepositoryRelativePath("/repo", "/repo/src/example.ts"),
    ).toBe("src/example.ts");
  });

  it("converts a repository-relative path to a full path", () => {
    const service = new RepositoryPathService();

    expect(service.toRepositoryFullPath("/repo", "src/example.ts")).toBe(
      "/repo/src/example.ts",
    );
  });

  it("resolves a full path from a repository id", async () => {
    const repositoryDBService = createMockRepoDBService({
      getRepository: vi.fn().mockResolvedValue({
        id: "repo-1",
        name: "CodeAtlas",
        path: "/repo",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      }),
    });
    const service = new RepositoryPathService(repositoryDBService);

    await expect(
      service.toRepositoryFullPathByRepositoryId("repo-1", "src/example.ts"),
    ).resolves.toBe("/repo/src/example.ts");
  });

  it("throws when the repository id does not exist", async () => {
    const repositoryDBService = createMockRepoDBService({
      getRepository: vi.fn().mockResolvedValue(null),
    });
    const service = new RepositoryPathService(repositoryDBService);

    await expect(
      service.toRepositoryFullPathByRepositoryId(
        "missing-repo",
        "src/example.ts",
      ),
    ).rejects.toEqual(new RepositoryNotFoundError("missing-repo"));
  });

  it("exposes module-level helpers", async () => {
    expect(toRepositoryRelativePath("/repo", "/repo/src/example.ts")).toBe(
      "src/example.ts",
    );
    expect(toRepositoryFullPath("/repo", "src/example.ts")).toBe(
      "/repo/src/example.ts",
    );
    // Confirm the export resolves — depth-tested in the walkDirectory() block
    await expect(walkDirectory(repo.rootPath)).resolves.toBeInstanceOf(Array);
  });

  // ---------------------------------------------------------------------------
  // walkDirectory()
  // ---------------------------------------------------------------------------

  describe("walkDirectory()", () => {
    it("returns only non-ignored files from the repository scaffold", async () => {
      // The default scaffold has src/index.ts, src/utils.ts, src/main.py,
      // README.md, and package.json. All other files are excluded by
      // NON_CODE_PATTERNS (node_modules, dist, *.config.*, tsconfig*, .git,
      // .vscode, *.log, .DS_Store, *.xcodeproj, hidden files) or .gitignore
      // (ignored-by-gitignore/).
      const service = new RepositoryPathService();

      const results = await service.walkDirectory(repo.rootPath);

      expect(results.sort()).toEqual([
        "README.md",
        "package.json",
        "src/index.ts",
        "src/main.py",
        "src/utils.ts",
      ]);
    });

    it("excludes files matched by non-code patterns", async () => {
      const service = new RepositoryPathService();

      const results = await service.walkDirectory(repo.rootPath);

      expect(results).not.toContain("node_modules/lodash/index.js");
      expect(results).not.toContain("dist/bundle.js");
      expect(results).not.toContain(".DS_Store");
      expect(results).not.toContain(".git/config");
      expect(results).not.toContain(".vscode/settings.json");
      expect(results).not.toContain("tsconfig.json");
      expect(results).not.toContain("app.config.ts");
      expect(results).not.toContain("MyApp.xcodeproj/project.pbxproj");
    });

    it("excludes files matched by .gitignore", async () => {
      const service = new RepositoryPathService();

      const results = await service.walkDirectory(repo.rootPath);

      expect(results).not.toContain("ignored-by-gitignore/secret.ts");
      expect(results).not.toContain("debug.log");
    });

    it("applies custom .gitignore rules on top of non-code patterns", async () => {
      // Override the gitignore so only src/ is excluded. Files previously
      // excluded by the default .gitignore (e.g. ignored-by-gitignore/) are
      // now reachable, while NON_CODE_PATTERNS still apply.
      const customRepo = new MockRepo({ gitignoreLines: ["src/"] });
      const service = new RepositoryPathService();

      const results = await service.walkDirectory(customRepo.rootPath);

      customRepo.cleanup();

      expect(results).not.toContain("src/index.ts");
      expect(results).not.toContain("src/utils.ts");
      expect(results).not.toContain("src/main.py");
      expect(results).toContain("README.md");
      // Previously excluded only by the default .gitignore — now reachable
      expect(results).toContain("ignored-by-gitignore/secret.ts");
    });

    it("returns paths relative to the repository root", async () => {
      const service = new RepositoryPathService();

      const results = await service.walkDirectory(repo.rootPath);

      for (const filePath of results) {
        expect(path.isAbsolute(filePath)).toBe(false);
      }
    });

    it("does not include directory entries in the results", async () => {
      const service = new RepositoryPathService();

      const results = await service.walkDirectory(repo.rootPath);

      expect(results).not.toContain("src");
      expect(results).not.toContain("node_modules");
    });

    it("returns every file exactly once", async () => {
      const service = new RepositoryPathService();

      const results = await service.walkDirectory(repo.rootPath);

      expect(new Set(results)).toHaveLength(results.length);
    });

    it("rejects when the directory does not exist", async () => {
      const service = new RepositoryPathService();

      // repo.resolve("missing") points to a path that was never created
      await expect(
        service.walkDirectory(repo.resolve("missing")),
      ).rejects.toThrow();
    });

    it("rejects when the path points to a file instead of a directory", async () => {
      const service = new RepositoryPathService();

      // src/index.ts is a known regular file in the default scaffold
      await expect(
        service.walkDirectory(repo.resolve("src/index.ts")),
      ).rejects.toThrow();
    });
  });
});
