import { z } from "zod";
import { SYMBOL_TYPES, VISIBILITY_LEVELS } from "../models/Symbol.js";

export const createRepositorySchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
});

export const startTrackingSchema = z.object({
  name: z.string().min(1),
});

export const untrackRepositorySchema = z.object({
  delete: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .transform((v) => v === true || v === "true"),
});

export const reindexPathSchema = z.object({
  subpath: z.string().optional(),
});

export const querySymbolsSchema = z.object({
  q: z.string().min(1),
  repositoryId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const listSymbolsSchema = z.object({
  repositoryId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const meaningSearchSchema = querySymbolsSchema;

export const configureOllamaProviderSchema = z.object({
  model: z.string().min(1),
  embeddingModel: z.string().min(1).optional(),
  baseUrl: z.string().url(),
});

export const configureOpenAIProviderSchema = z.object({
  model: z.string().min(1),
  embeddingModel: z.string().min(1).optional(),
  apiKey: z.string().min(1),
});

export const upsertSymbolSchema = z.object({
  repositoryId: z.string().uuid(),
  symbol: z.string().min(1),
  file: z.string().min(1),
  type: z.enum(SYMBOL_TYPES).optional(),
  visibility: z.enum(VISIBILITY_LEVELS).optional(),
  blurb: z.string().max(300).optional(),
  implementation: z.string().max(1000).optional(),
  tags: z.array(z.string()).optional(),
});
