export interface Repository {
  id: string;
  name: string;
  path: string;
  createdAt: Date;
}

export interface CreateRepositoryInput {
  name: string;
  path: string;
}

export interface UpdateRepositoryInput {
  name?: string;
  path?: string;
}

export interface ReindexResult {
  filesIndexed: number;
  symbolsIndexed: number;
}

export class RepositoryNotFoundError extends Error {
  readonly repositoryId: string;

  constructor(repositoryId: string) {
    super(`Repository not found: ${repositoryId}`);
    this.name = "RepositoryNotFoundError";
    this.repositoryId = repositoryId;
  }
}

export class RepositoryPathNotFoundError extends Error {
  readonly repositoryPath: string;

  constructor(repositoryPath: string) {
    super(`Repository path does not exist: ${repositoryPath}`);
    this.name = "RepositoryPathNotFoundError";
    this.repositoryPath = repositoryPath;
  }
}

export class RepositoryPathNotDirectoryError extends Error {
  readonly repositoryPath: string;

  constructor(repositoryPath: string) {
    super(`Repository path is not a directory: ${repositoryPath}`);
    this.name = "RepositoryPathNotDirectoryError";
    this.repositoryPath = repositoryPath;
  }
}

export class RepositoryIndexingError extends Error {
  readonly repositoryId: string;
  readonly filePath?: string;

  constructor(repositoryId: string, cause: unknown, filePath?: string) {
    const scope = filePath
      ? ` while indexing file ${filePath}`
      : " during repository reindex";
    const message =
      cause instanceof Error ? cause.message : "Unknown indexing failure";

    super(`Failed to index repository ${repositoryId}${scope}: ${message}`);
    this.name = "RepositoryIndexingError";
    this.repositoryId = repositoryId;
    this.filePath = filePath;
  }
}
