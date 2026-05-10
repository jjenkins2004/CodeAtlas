export const SYMBOL_TYPES = [
  "function",
  "class",
  "enum",
  "protocol",
  "method",
] as const;

export const VISIBILITY_LEVELS = ["public", "internal", "private"] as const;

export type SymbolType = (typeof SYMBOL_TYPES)[number];

export type Visibility = (typeof VISIBILITY_LEVELS)[number];

export interface Symbol {
  id: string;
  repositoryId: string;

  // Metadata (tree-sitter extracted)
  symbol: string;
  file: string;
  type: SymbolType;
  visibility: Visibility;

  // Semantic fields (LLM generated)
  blurb: string | null;
  implementation: string | null;
  tags: string[];

  // Vector embedding of the concatenated semantic fields
  embedding: number[] | null;

  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSymbolInput {
  repositoryId: string;
  symbol: string;
  file: string;
  type: SymbolType;
  visibility: Visibility;
  blurb?: string;
  implementation?: string;
  tags?: string[];
  embedding?: number[];
}

export interface UpdateSymbolInput {
  symbol?: string;
  file?: string;
  type?: SymbolType;
  visibility?: Visibility;
  blurb?: string;
  implementation?: string;
  tags?: string[];
  embedding?: number[];
}

export interface SymbolQueryResult {
  id: string;
  repositoryId: string;
  symbol: string;
  file: string;
  type: SymbolType;
  visibility: Visibility;
  blurb: string | null;
  tags: string[];
  score: number;
}
