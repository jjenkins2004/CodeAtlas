import { z } from "zod";
import { symbolDBService as defaultSymbolDBService } from "../db/services/symbol.js";
import type { SymbolDBService } from "../db/services/symbol.js";
import type { CreateSymbolInput } from "../models/Symbol.js";
import { embeddingService as defaultEmbeddingService } from "./EmbeddingService.js";
import type { EmbeddingServicePort } from "./EmbeddingService.js";
import { llmService as defaultLLMService } from "./LLMService.js";
import type { LLMServicePort } from "./LLMService.js";
import { createLogger } from "./util/Logger.js";

const logger = createLogger({ component: "indexer" });

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export interface IndexSymbolInput extends CreateSymbolInput {
  /** Raw source code body extracted by tree-sitter. Used to generate semantic fields. */
  body: string;
}

// ---------------------------------------------------------------------------
// Port
// ---------------------------------------------------------------------------

export interface IndexerServicePort {
  /** Indexes a single symbol record for a repository. */
  indexSymbol(symbol: IndexSymbolInput): Promise<void>;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const symbolSemanticSchema = z.object({
  blurb: z.string(),
  implementation: z.string(),
  tags: z.array(z.string()),
});

const symbolSemanticUpdateSchema = z.object({
  blurb: z.string().optional(),
  implementation: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const semanticFieldExplainer = `
The following are the instructions for each field's output:
For all output, keep the wording high quality, concise, and free of fluff or filler.
Do not try to fill a word count when the symbol is simple.
Use only the amount of detail the symbol actually needs, but make sure the explanation is complete, accurate, and useful.
If a symbol is complex, give it the extra detail it needs; if it is simple, stay brief instead of padding.

- "blurb": Explains the symbol's purpose to another engineer. Keep it under 50 words.
  Function example: "Parses and normalizes an incoming user profile payload before it is saved to the database."
  Class example: "Coordinates the lifecycle of repository indexing, including file scanning, symbol extraction, and semantic updates."
  Enum example: "Defines the supported repository states that control whether indexing and syncing are allowed."

- "implementation": One complete paragraph that explains the symbol's own logic, inputs, outputs, and important branching. The word count is flexible for very simple symbols, but keep it concise and high quality with no fluff or filler. Do not describe helper functions it calls.
  Function example: "This function validates the request body, converts the raw payload into the internal profile shape, rejects missing required fields with a typed error, and returns the normalized object for persistence. It only mutates local data and leaves storage to its caller."
  Class example: "This class stores repository metadata, exposes methods for starting and stopping indexing, and keeps the current repository state in memory so callers can avoid repeating setup work. It creates internal service instances once, reuses them across operations, and guards against duplicate start requests."
  Enum example: "This enum enumerates the allowed repository states and is used by callers to branch between active syncing, paused indexing, and archived read-only behavior. It contains no behavior and only provides stable named values for state checks."

- "tags": An array of 2 to 5 short semantic phrases that describe the symbol's job. Use lowercase strings only.
  Function example: ["profile normalization", "request validation", "payload parsing"]
  Class example: ["repository indexing", "lifecycle management", "file scanning"]
  Enum example: ["repository state", "indexing mode", "sync control"]
`.trim();

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

function buildGeneratePrompt(input: IndexSymbolInput): string {
  return [
    `Analyze the following ${input.type} symbol named "${input.symbol}" and generate semantic metadata for the CodeAtlas index.`,
    "",
    `Code:`,
    "```",
    input.body,
    "```",
    "",
    "Return a JSON object with exactly these fields:",
    semanticFieldExplainer,
  ].join("\n");
}

function buildUpdateCheckPrompt(input: IndexSymbolInput): string {
  return [
    `A code symbol named "${input.symbol}" (${input.type}) has changed. Return only the semantic fields that need to be updated for the CodeAtlas index.`,
    "",
    "Updated code:",
    "```",
    input.body,
    "```",
    "",
    "Return a JSON object containing only the fields that need to change.",
    "If no changes are needed, return an empty JSON object.",
    semanticFieldExplainer,
  ].join("\n");
}

function buildEmbeddingText(fields: {
  symbol: string;
  type: string;
  blurb: string;
  implementation: string;
  tags: string[];
}): string {
  return [
    `symbol: ${fields.symbol}`,
    `type: ${fields.type}`,
    `blurb: ${fields.blurb}`,
    `implementation: ${fields.implementation}`,
    `tags: ${fields.tags.join(", ")}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface IndexerServiceConfig {
  embeddingService?: EmbeddingServicePort;
  llmService?: LLMServicePort;
  symbolDBService?: Pick<SymbolDBService, "upsertSymbol">;
}

export class IndexerService implements IndexerServicePort {
  private readonly embedding: EmbeddingServicePort;
  private readonly llm: LLMServicePort;
  private readonly db: Pick<SymbolDBService, "upsertSymbol">;

  constructor(config: IndexerServiceConfig = {}) {
    this.embedding = config.embeddingService ?? defaultEmbeddingService;
    this.llm = config.llmService ?? defaultLLMService;
    this.db = config.symbolDBService ?? defaultSymbolDBService;
  }

  async indexSymbol(input: IndexSymbolInput): Promise<void> {
    const hasExistingSemantics =
      input.blurb != null && input.implementation != null;

    logger.debug(
      {
        repositoryId: input.repositoryId,
        symbol: input.symbol,
        type: input.type,
        hasExistingSemantics,
      },
      "Indexing symbol",
    );

    let blurb: string;
    let implementation: string;
    let tags: string[];

    if (!hasExistingSemantics) {
      const generated = await this.llm.promptForStructuredJson(
        buildGeneratePrompt(input),
        symbolSemanticSchema,
      );
      blurb = generated.blurb;
      implementation = generated.implementation;
      tags = generated.tags;
    } else {
      const updates = await this.llm.promptForStructuredJson(
        buildUpdateCheckPrompt(input),
        symbolSemanticUpdateSchema,
      );

      blurb = updates.blurb ?? input.blurb!;
      implementation = updates.implementation ?? input.implementation!;
      tags = updates.tags ?? input.tags ?? [];
    }

    const embeddingText = buildEmbeddingText({
      symbol: input.symbol,
      type: input.type,
      blurb,
      implementation,
      tags,
    });

    const embedding = await this.embedding.embed(embeddingText);

    await this.db.upsertSymbol({
      repositoryId: input.repositoryId,
      symbol: input.symbol,
      fileId: input.fileId,
      hash: input.hash,
      type: input.type,
      visibility: input.visibility,
      blurb,
      implementation,
      tags,
      embedding,
    });

    logger.debug(
      {
        repositoryId: input.repositoryId,
        symbol: input.symbol,
        type: input.type,
      },
      "Indexed symbol",
    );
  }
}

export const indexerService = new IndexerService();

/** Indexes a single symbol record for a repository. */
export const indexSymbol = (symbol: IndexSymbolInput): Promise<void> =>
  indexerService.indexSymbol(symbol);
