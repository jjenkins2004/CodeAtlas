import { RepositoryOrchestratorService } from "../../../services/Repository.js";
import { RepositoryInitializerService } from "../../../services/RepositoryInitializerService.js";
import { FileUpdateService } from "../../../services/FileUpdateService.js";
import { IndexerService } from "../../../services/IndexerService.js";
import { Watcher } from "../../../services/Watcher.js";
import { DebounceService } from "../../../services/util/DebounceService.js";
import { RepositoryDBService } from "../../../db/services/repository.js";
import { FileDBService } from "../../../db/services/file.js";
import { SymbolDBService } from "../../../db/services/symbol.js";
import { hasherService } from "../../../services/util/Hasher.js";
import { treeSitterService } from "../../../services/treesitter/TreeSitter.js";
import { repositoryPathService } from "../../../services/util/RepositoryPathService.js";
import type { DatabaseClient } from "../../../db/client.js";
import {
  createMockLLMService,
  createMockEmbeddingService,
  type MockLLMService,
  type MockEmbeddingService,
} from "./mockProviders.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntegrationServices {
  orchestrator: RepositoryOrchestratorService;
  initializer: RepositoryInitializerService;
  fileUpdater: FileUpdateService;
  repositoryDbService: RepositoryDBService;
  fileDbService: FileDBService;
  symbolDbService: SymbolDBService;
  watcher: Watcher;
  mockLLM: MockLLMService;
  mockEmbedding: MockEmbeddingService;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Assembles the full real service graph wired against a test DB, with the LLM
 * and embedding boundaries replaced by deterministic mocks.
 *
 * File- and symbol-level debounce windows are set to 50 ms so tests complete
 * in under a second rather than waiting 25 s.
 *
 * Each call returns a fresh set of instances — share nothing between tests.
 */
export function createIntegrationServices(
  db: DatabaseClient,
): IntegrationServices {
  const mockLLM = createMockLLMService();
  const mockEmbedding = createMockEmbeddingService();

  // Real DB services backed by the test database
  const repositoryDbService = new RepositoryDBService(db);
  const fileDbService = new FileDBService(db);
  const symbolDbService = new SymbolDBService(db);

  // Indexer: real logic, mocked external calls
  const indexer = new IndexerService({
    llmService: mockLLM,
    embeddingService: mockEmbedding,
    symbolDBService: symbolDbService,
  });

  // Initializer: real crawl + tree-sitter + hashing, delegates to indexer
  const initializer = new RepositoryInitializerService({
    repositoryDBService: repositoryDbService,
    fileDBService: fileDbService,
    indexerService: indexer,
    hasherService,
    treeSitterService,
    repositoryPathService,
  });

  // Fresh debounce instances per test to prevent cross-test key collisions
  const fileDebounceService = new DebounceService();
  const symbolDebounceService = new DebounceService();

  // File update pipeline: real debounce → real hash gate → real translator → real indexer
  const fileUpdater = new FileUpdateService({
    debounceService: fileDebounceService,
    fileDBService: fileDbService,
    hasherService,
    indexService: indexer,
    repositoryPathService,
    debounceMs: 50,
    symbolDebounceMs: 50,
    translatorDebounceService: symbolDebounceService,
  });

  const watcher = new Watcher();

  const orchestrator = new RepositoryOrchestratorService({
    repositoryDBService: repositoryDbService,
    repositoryInitializerService: initializer,
    fileUpdateService: fileUpdater,
    repositoryPathService,
    watcher,
  });

  return {
    orchestrator,
    initializer,
    fileUpdater,
    repositoryDbService,
    fileDbService,
    symbolDbService,
    watcher,
    mockLLM,
    mockEmbedding,
  };
}
