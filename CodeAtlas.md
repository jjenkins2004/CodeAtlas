## Goals

- Reduce token usage
- Use shared codebase logic all the time as much as possible
- Fast database of public functions and classes based on meaning so agent knows exactly what to use

## How it’s used

1. Agent calls MCP for bits of logic for its implementation
   1. EX: “string to date”, “abstraction for creating LLM prompts”, “fetching image given id”
2. Returns list of usable interfaces based on the query with symbol name, blurb, file, match score (0-1)

## Implementation

- Typescript/Node
- Tree-sitter
- PostgreSQL \+ pgvector

### Querying

- Query should only be a string that’s meant to be a “logic bit” that’s short and encapsulate what it’s supposed to do
- Embed query and search against embedded symbols

### Symbol Embedding

```
symbol: …
type: …
blurb: …
implementation: …
tags: …
```

### Track

- Endpoint to begin tracking a new repository
- Takes name \+ path
- Ensures that this isn’t already being tracked internally

### Untrack

- Stops tracking a repository given ID
- Bool Parameter to delete as well

### Updating

- Use file watcher to watch for file updates, ensure to ignore the same .gitignore files
- Push file changes into a strict debounce queue driven by a rolling 3-second timer
- Queue is backed by a Set of file paths so duplicate saves do not duplicate work
- Every new save resets the timer, so indexing only starts once the user pauses
- Use tree-sitter to extract metadata and exact code block
- Use tree-sitter to fill in symbol, file, type, visibility fields
- Feed agent context, ask if “meaning” fields need to be changed, if not it’s done
- Otherwise, feed agent context, have it create the blurb, implementation, and semantic tags for only specifically that symbol
- Expose manual update endpoint that upserts to a provided symbol

### Debounce Queue

- Watcher events add changed file paths into a Set and reset a 3-second timer
- This avoids indexing on every save or keystroke and keeps the app responsive
- Queue flushes only after a short idle window, capturing code at a natural resting point
- Outcome: fewer redundant index operations and lower CPU pressure during active coding

### Syntax Gate

- On queue flush, each file is parsed locally with Tree-sitter before any LLM work
- AST is inspected for major ERROR nodes
- If syntax is structurally incomplete (mid-edit), file is skipped from that batch
- Only structurally valid code continues to embedding, preventing token waste on broken code

### Content Hashing

- Before calling any LLM APIs, generate a SHA-256 hash of raw file contents via Node crypto
- Compare current hash to stored fileHash in the database
- If hashes match, skip LLM generation entirely and update only mtime metadata
- If hashes differ, continue with semantic regeneration and embedding updates
- Outcome: tokens are spent only when actual code bytes change

### ReIndex

- Crawl through all files except, not including ones in gitignore
- Use tree-sitter and create the entries for everything
- Exposed as an endpoint to reindex entire codebase
- Expose finer grain version that just reindexes a folder/file

## Symbol

### Metadata

- Symbol
- File
- Symbol type (class, protocol, function, etc)
- visibility: public, internal, private, etc

### Blurb

- Short overview of what it does
- Max 50 words

### Implementation

- Detailed implementation, goals, and logic but only pertaining to this symbols scope, so it shouldn’t begin explaining functions it owns, those will be their own symbols
- Max 150 words

### Semantic Tags

- Short tags that describe the function of symbol
- EX: “string to date”, “date parsing”
