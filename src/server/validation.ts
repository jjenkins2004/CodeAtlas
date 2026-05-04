import { z } from "zod";

export const createRepositorySchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
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

export const upsertSymbolSchema = z.object({
  repositoryId: z.string().uuid(),
  symbol: z.string().min(1),
  file: z.string().min(1),
  type: z
    .enum([
      "function",
      "class",
      "interface",
      "enum",
      "type",
      "constant",
      "method",
      "property",
      "protocol",
      "struct",
      "unknown",
    ])
    .optional(),
  visibility: z
    .enum(["public", "internal", "private", "protected"])
    .optional(),
  blurb: z.string().max(300).optional(),
  implementation: z.string().max(1000).optional(),
  tags: z.array(z.string()).optional(),
});
