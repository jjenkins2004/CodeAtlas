import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SymbolService } from "../services/SymbolService.js";
import { RepositoryService } from "../services/RepositoryService.js";

/**
 * Builds and returns a configured MCP server instance.
 * All tool implementations delegate to the shared service layer.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "code-atlas",
    version: "0.1.0",
  });

  // ── Tools ──────────────────────────────────────────────────────────────────

  /**
   * query_symbols
   * Semantic search: find symbols matching a natural-language description.
   */
  server.tool(
    "query_symbols",
    "Search the symbol index using a natural-language description of desired logic. " +
      "Returns a ranked list of matching symbols with their name, file, type, blurb, tags, and match score.",
    {
      query: z
        .string()
        .min(1)
        .describe(
          'Short description of the logic bit to find, e.g. "string to date"'
        ),
      repositoryId: z
        .string()
        .uuid()
        .optional()
        .describe("Limit results to a specific repository"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe("Maximum number of results to return"),
    },
    async ({ query, repositoryId, limit }) => {
      const results = await SymbolService.query(query, limit, repositoryId);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    }
  );

  /**
   * track_repository
   * Begin tracking a new repository so its symbols are indexed.
   */
  server.tool(
    "track_repository",
    "Register a local repository for indexing. " +
      "Triggers an initial full index and starts a file watcher for incremental updates.",
    {
      name: z.string().min(1).describe("Human-readable name for the repository"),
      path: z
        .string()
        .min(1)
        .describe("Absolute path to the repository root on disk"),
    },
    async ({ name, path }) => {
      const repository = await RepositoryService.track({ name, path });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(repository, null, 2),
          },
        ],
      };
    }
  );

  /**
   * list_repositories
   * Return all currently tracked repositories.
   */
  server.tool(
    "list_repositories",
    "Return all repositories currently being tracked by CodeAtlas.",
    {},
    async () => {
      const repositories = await RepositoryService.list();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(repositories, null, 2),
          },
        ],
      };
    }
  );

  /**
   * untrack_repository
   * Stop tracking a repository, optionally deleting its indexed symbols.
   */
  server.tool(
    "untrack_repository",
    "Stop tracking a repository. Optionally delete all of its indexed symbols.",
    {
      repositoryId: z.string().uuid().describe("ID of the repository to untrack"),
      delete: z
        .boolean()
        .default(false)
        .describe("When true, also removes all indexed symbols for this repository"),
    },
    async ({ repositoryId, delete: shouldDelete }) => {
      await RepositoryService.untrack(repositoryId, shouldDelete);
      return {
        content: [
          {
            type: "text",
            text: `Repository ${repositoryId} untracked${shouldDelete ? " and deleted" : ""}.`,
          },
        ],
      };
    }
  );

  /**
   * reindex_repository
   * Trigger a full or partial reindex of a tracked repository.
   */
  server.tool(
    "reindex_repository",
    "Reindex a tracked repository. Optionally scope the crawl to a sub-path.",
    {
      repositoryId: z.string().uuid().describe("ID of the repository to reindex"),
      subpath: z
        .string()
        .optional()
        .describe(
          "Relative sub-path within the repository to limit the reindex scope"
        ),
    },
    async ({ repositoryId, subpath }) => {
      await RepositoryService.reindex(repositoryId, subpath);
      return {
        content: [
          {
            type: "text",
            text: "Reindex started.",
          },
        ],
      };
    }
  );

  return server;
}

/**
 * Start the MCP server over stdio (for use as a subprocess by MCP hosts).
 */
export async function startMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
