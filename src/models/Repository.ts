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
