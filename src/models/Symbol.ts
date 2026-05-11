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

interface SymbolCoreFields {
  repositoryId: string;
  symbol: string;
  file: string;
  type: SymbolType;
  visibility: Visibility;
}

export interface SymbolSemanticFields {
  blurb: string | null;
  implementation: string | null;
  tags: string[];
  embedding: number[] | null;
}

interface SymbolSemanticInputFields {
  blurb?: string;
  implementation?: string;
  tags?: string[];
  embedding?: number[];
}

export interface Symbol extends SymbolCoreFields, SymbolSemanticFields {
  id: string;

  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSymbolInput
  extends SymbolCoreFields, SymbolSemanticInputFields {}

export interface UpdateSymbolInput
  extends Partial<SymbolCoreFields>, SymbolSemanticInputFields {}

export interface SymbolQueryResult extends Pick<
  Symbol,
  | "id"
  | "repositoryId"
  | "symbol"
  | "file"
  | "type"
  | "visibility"
  | "blurb"
  | "tags"
> {
  score: number;
}
