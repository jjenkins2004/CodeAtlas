import { describe, expect, it, vi } from "vitest";
import { RepositoryNotFoundError } from "../../models/Repository.js";
import { createMockRepoDBService } from "../fixtures/mockRepoDBService.js";
import {
  RepositoryPathService,
  toRepositoryFullPath,
  toRepositoryFullPathByRepositoryId,
  toRepositoryRelativePath,
} from "../../services/util/RepositoryPathService.js";

describe("RepositoryPathService", () => {
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
  });
});
