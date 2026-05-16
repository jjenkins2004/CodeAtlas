import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const mockedServices = vi.hoisted(() => {
  return {
    track: vi.fn(),
    start: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    untrack: vi.fn(),
    reindex: vi.fn(),
    query: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    configureLLM: vi.fn(),
    configureEmbedding: vi.fn(),
  };
});

vi.mock("../../../services/RepositoryService", () => ({
  RepositoryService: {
    track: mockedServices.track,
    start: mockedServices.start,
    list: mockedServices.list,
    get: mockedServices.get,
    untrack: mockedServices.untrack,
    reindex: mockedServices.reindex,
  },
}));

vi.mock("../../../services/SymbolService.js", () => ({
  SymbolService: {
    query: mockedServices.query,
    upsert: mockedServices.upsert,
    get: vi.fn(),
    delete: mockedServices.delete,
  },
}));

vi.mock("../../../services/LLMService.js", () => ({
  llmService: {
    configure: mockedServices.configureLLM,
  },
}));

vi.mock("../../../services/EmbeddingService.js", () => ({
  embeddingService: {
    configure: mockedServices.configureEmbedding,
  },
}));

import { createApp } from "../../../server/app.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
  const app = createApp();
  const server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const address = server.address() as AddressInfo;
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function stopServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Server API endpoints", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockedServices.track.mockResolvedValue({
      id: "repo-id",
      name: "atlas",
      path: "/tmp/atlas",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    mockedServices.start.mockResolvedValue({
      id: "repo-id",
      name: "atlas",
      path: "/tmp/atlas",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    mockedServices.query.mockResolvedValue([
      {
        id: "sym-1",
        repositoryId: "repo-id",
        symbol: "parseDate",
        fileId: "file-1",
        type: "function",
        visibility: "public",
        blurb: "Parses an ISO date string",
        tags: ["date parsing"],
        score: 0.95,
      },
    ]);

    const started = await startServer();
    server = started.server;
    baseUrl = started.baseUrl;
  });

  afterEach(async () => {
    await stopServer(server);
  });

  // ---------------------------------------------------------------------------
  // repository endpoints
  // ---------------------------------------------------------------------------

  describe("repository endpoints", () => {
    it("registers a repository via POST /api/v1/repositories", async () => {
      const response = await fetch(`${baseUrl}/api/v1/repositories`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "atlas", path: "/tmp/atlas" }),
      });

      expect(response.status).toBe(201);
      const payload = await response.json();
      expect(payload).toMatchObject({
        id: "repo-id",
        name: "atlas",
        path: "/tmp/atlas",
      });
      expect(mockedServices.track).toHaveBeenCalledWith({
        name: "atlas",
        path: "/tmp/atlas",
      });
    });

    it("starts a registered repository via POST /api/v1/repositories/start", async () => {
      const response = await fetch(`${baseUrl}/api/v1/repositories/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "atlas" }),
      });

      expect(response.status).toBe(200);
      expect(mockedServices.start).toHaveBeenCalledWith("atlas");
    });
  });

  // ---------------------------------------------------------------------------
  // provider endpoints
  // ---------------------------------------------------------------------------

  describe("provider endpoints", () => {
    it("configures OpenAI provider via POST /api/v1/providers/openai", async () => {
      const response = await fetch(`${baseUrl}/api/v1/providers/openai`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          apiKey: "test-key",
        }),
      });

      expect(response.status).toBe(200);
      expect(mockedServices.configureLLM).toHaveBeenCalledTimes(1);
      expect(mockedServices.configureEmbedding).toHaveBeenCalledTimes(1);

      const payload = (await response.json()) as {
        message: string;
        provider: string;
        model: string;
        embeddingModel: string;
      };
      expect(payload).toMatchObject({
        message: "Provider configured",
        provider: "openai",
        model: "gpt-4o-mini",
        embeddingModel: "gpt-4o-mini",
      });
    });

    it("configures Ollama provider via POST /api/v1/providers/ollama", async () => {
      const response = await fetch(`${baseUrl}/api/v1/providers/ollama`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "llama3.1:8b",
          baseUrl: "http://localhost:11434",
        }),
      });

      expect(response.status).toBe(200);
      expect(mockedServices.configureLLM).toHaveBeenCalledTimes(1);
      expect(mockedServices.configureEmbedding).toHaveBeenCalledTimes(1);

      const payload = (await response.json()) as {
        message: string;
        provider: string;
        model: string;
        embeddingModel: string;
      };
      expect(payload).toMatchObject({
        message: "Provider configured",
        provider: "ollama",
        model: "llama3.1:8b",
        embeddingModel: "llama3.1:8b",
      });
    });

    it("returns validation error when API key is missing for openai endpoint", async () => {
      const response = await fetch(`${baseUrl}/api/v1/providers/openai`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
        }),
      });

      expect(response.status).toBe(400);
      const payload = (await response.json()) as {
        error: string;
        details: unknown;
      };
      expect(payload.error).toBe("Validation error");
      expect(mockedServices.configureLLM).not.toHaveBeenCalled();
      expect(mockedServices.configureEmbedding).not.toHaveBeenCalled();
    });

    it("returns validation error when baseUrl is missing for ollama endpoint", async () => {
      const response = await fetch(`${baseUrl}/api/v1/providers/ollama`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "llama3.1:8b",
        }),
      });

      expect(response.status).toBe(400);
      const payload = (await response.json()) as {
        error: string;
        details: unknown;
      };
      expect(payload.error).toBe("Validation error");
      expect(mockedServices.configureLLM).not.toHaveBeenCalled();
      expect(mockedServices.configureEmbedding).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // search endpoints
  // ---------------------------------------------------------------------------

  describe("search endpoints", () => {
    it("searches by meaning via GET /api/v1/search/meaning", async () => {
      const response = await fetch(
        `${baseUrl}/api/v1/search/meaning?q=parse%20date&limit=5&repositoryId=64fcb4fa-4780-4c91-b8dd-6e58fb9dddc6`,
      );

      expect(response.status).toBe(200);

      const payload = (await response.json()) as Array<{
        id: string;
        symbol: string;
        score: number;
      }>;
      expect(payload).toHaveLength(1);
      expect(payload[0]).toMatchObject({
        symbol: "parseDate",
        score: 0.95,
      });
      expect(mockedServices.query).toHaveBeenCalledWith(
        "parse date",
        5,
        "64fcb4fa-4780-4c91-b8dd-6e58fb9dddc6",
      );
    });

    it("returns validation error when meaning query text is missing", async () => {
      const response = await fetch(`${baseUrl}/api/v1/search/meaning?limit=5`);

      expect(response.status).toBe(400);
      const payload = (await response.json()) as {
        error: string;
        details: unknown;
      };
      expect(payload.error).toBe("Validation error");
      expect(mockedServices.query).not.toHaveBeenCalled();
    });
  });
});
