---
description: "CodeAtlas test conventions — golden structure for all Vitest test files. Always apply when writing or reviewing test files in src/tests/."
applyTo: "src/tests/**"
---

# CodeAtlas — Test Conventions

`src/tests/services/Watcher.test.ts` and `src/tests/services/IgnoreFilter.test.ts` are the golden reference. Match their structure exactly.

## File Layout

Every test file follows this top-to-bottom order:

```
1. Imports
2. // Helpers section (if needed)
3. // Tests section
   └── describe("ClassName")
         └── describe("methodName()")
               └── it("...")
```

---

## Imports

Vitest named imports come first, then source modules, then fixtures. Always use `.js` extensions on local imports.

```ts
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { MyService, MyServiceConfig } from "../../services/MyService.js";
import { MockRepo } from "../fixtures/mockRepo.js";
```

---

## Section Separators

Use the exact 75-dash block comment to separate top-level sections and each method group:

```ts
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ... helper functions ...

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MyService", () => {

  // ---------------------------------------------------------------------------
  // methodName()
  // ---------------------------------------------------------------------------

  describe("methodName()", () => { ... });
});
```

### Factory functions 

Always provide sensible defaults. Accept Partial overrides so individual tests only supply what they actually care about:

### Non-obvious helpers — add JSDoc

If a helper's purpose isn't immediately clear from its signature, add a JSDoc block:

```ts
/**
 * Returns a promise that resolves with the first value passed to `fn` once
 * it is called, or rejects after `timeoutMs` milliseconds.
 */
function waitForCall(fn: ReturnType<typeof vi.fn>, timeoutMs = 3000): Promise<string> { ... }
```

---

## Fixtures

Use Fixture defaults wherever possible. Only override what the specific test scenario requires:

```ts
// Good — uses all defaults, only overrides gitignore
const repo = new MockRepo({ gitignoreLines: ["dist/"] });

// Bad — don't rebuild what MockRepo already scaffolds
const repo = new MockRepo({
  files: [{ relativePath: "src/index.ts", content: "..." }],
});
```

Always create in `beforeEach`, always clean up in `afterEach`:

```ts
beforeEach(() => {
  repo = new MockRepo();
});
afterEach(() => {
  repo.cleanup();
});
```

---

## `describe` Nesting

- Top-level `describe` → the class or module under test: `describe("Watcher", () => {`
- Second level → the method being exercised, with parens: `describe("start()", () => {`
- Do not nest deeper than two levels unless testing a distinct sub-behavior (e.g. `describe("NON_CODE_PATTERNS", () => {`).

---

## Test Names (`it(...)`)

Write plain English statements that complete the sentence _"it …"_:

```ts
// Good
it("fires onCreation when a new source file is added", ...)
it("returns early if no watcher is registered", ...)
it("does not fire onCreation for paths ignored by .gitignore", ...)

// Bad
it("test onCreation", ...)
it("should work", ...)
```

---

## Negative / "must NOT fire" Tests

When asserting that an event does **not** arrive, add a short wait then assert the mock was not called. Comment why the wait is there — it's not obvious:

```ts
// Give chokidar a moment — event must NOT arrive
await new Promise((r) => setTimeout(r, 500));
expect(config.onCreation).not.toHaveBeenCalled();
```

---

## Inline Comments for Obscure Intent

Add a brief inline comment whenever the intent of a line isn't obvious from the code alone:

```ts
// Restore permissions so cleanup() can remove it
fs.chmodSync(gitignorePath, 0o644);
```

---

## Async Event Assertions

For event-driven async tests, use a `waitForCall`-style promise that races against a timeout rather than arbitrary `setTimeout` waits:

```ts
const received = waitForCall(config.onCreation as ReturnType<typeof vi.fn>);
repo.writeFile("src/newFile.ts", "export {}");
expect(await received).toBe(repo.resolve("src/newFile.ts"));
```

---

## Test File Location

Mirror the source structure under `src/tests/`:
