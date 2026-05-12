export interface File {
  id: string;
  repositoryId: string;
  path: string;
  hash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFileInput {
  repositoryId: string;
  path: string;
  hash: string;
}

export interface UpdateFileInput {
  repositoryId?: string;
  path?: string;
  hash?: string;
}
