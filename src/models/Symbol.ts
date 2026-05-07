export type SymbolType =
  | "function"
  | "class"
  | "enum"
  | "protocol"
  | "method"

export type Visibility = "public" | "internal" | "private";

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
