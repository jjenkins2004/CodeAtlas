import { vi } from "vitest";
import type {
  CreateRepositoryInput,
  Repository,
} from "../../models/Repository.js";
import type {
  RepositoryDBServicePort,
  UpdateRepositoryInput,
} from "../../db/services/repository.js";

export type MockRepoDBService = RepositoryDBServicePort & {
  createRepository: ReturnType<typeof vi.fn>;
  getRepository: ReturnType<typeof vi.fn>;
  listRepositories: ReturnType<typeof vi.fn>;
  updateRepository: ReturnType<typeof vi.fn>;
  removeRepository: ReturnType<typeof vi.fn>;
};

export function createMockRepoDBService(
  overrides: Partial<RepositoryDBServicePort> = {},
): MockRepoDBService {
  return {
    createRepository: vi.fn(),
    getRepository: vi.fn(),
    listRepositories: vi.fn(),
    updateRepository: vi.fn(),
    removeRepository: vi.fn(),
    ...overrides,
  } as MockRepoDBService;
}
