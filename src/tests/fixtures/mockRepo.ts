import fs from "fs";
import os from "os";
import path from "path";

export interface MockRepoFile {
  /** Relative path from repo root, e.g. "src/index.ts" */
  relativePath: string;
  content?: string;
}

export interface MockRepoOptions {
  /**
   * Additional files to create beyond the default scaffold.
   * Merged with (and can override) the defaults.
   */
  files?: MockRepoFile[];
  /**
   * Lines to write into the repo's .gitignore.
   * Omit to use the default .gitignore. Pass an empty array to skip it.
   */
  gitignoreLines?: string[];
}

const DEFAULT_GITIGNORE_LINES = [
  "# Dependencies",
  "node_modules/",
  "",
  "# Build output",
  "dist/",
  "build/",
  "",
  "# Env files",
  ".env",
  ".env.local",
  "",
  "# Logs",
  "*.log",
  "",
  "# Custom ignored dir",
  "ignored-by-gitignore/",
];

/** Default file scaffold that gives tests a realistic repo surface. */
const DEFAULT_FILES: MockRepoFile[] = [
  { relativePath: "src/index.ts", content: 'export const hello = "world";' },
  {
    relativePath: "src/utils.ts",
    content: "export const add = (a: number, b: number) => a + b;",
  },
  { relativePath: "src/main.py", content: "print('hello')" },
  { relativePath: "README.md", content: "# Mock Repo" },
  {
    relativePath: "package.json",
    content: '{"name":"mock-repo","version":"0.0.1"}',
  },
  // These should be ignored by NON_CODE_PATTERNS / .gitignore
  { relativePath: "node_modules/lodash/index.js", content: "" },
  { relativePath: "dist/bundle.js", content: "" },
  { relativePath: ".git/config", content: "" },
  { relativePath: ".vscode/settings.json", content: "" },
  { relativePath: "tsconfig.json", content: "{}" },
  { relativePath: "app.config.ts", content: "" },
  { relativePath: "debug.log", content: "" },
  { relativePath: ".DS_Store", content: "" },
  { relativePath: "ignored-by-gitignore/secret.ts", content: "" },
  { relativePath: "MyApp.xcodeproj/project.pbxproj", content: "" },
];

/**
 * A temporary mock repository for use in tests.
 *
 * @example
 * let repo: MockRepo;
 * beforeEach(() => { repo = new MockRepo(); });
 * afterEach(() => { repo.cleanup(); });
 */
export class MockRepo {
  /** Absolute path to the repo root temp directory */
  readonly rootPath: string;

  constructor(options: MockRepoOptions = {}) {
    this.rootPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "codeatlas-mock-repo-"),
    );

    // Write .gitignore
    const gitignoreLines = options.gitignoreLines ?? DEFAULT_GITIGNORE_LINES;
    if (gitignoreLines.length > 0) {
      this.writeFile(".gitignore", gitignoreLines.join("\n") + "\n");
    }

    // Write default scaffold files
    for (const file of DEFAULT_FILES) {
      this.writeFile(file.relativePath, file.content);
    }

    // Write caller-supplied files (can override defaults)
    for (const file of options.files ?? []) {
      this.writeFile(file.relativePath, file.content);
    }
  }

  /** Resolve a relative path against the repo root */
  resolve(...segments: string[]): string {
    return path.join(this.rootPath, ...segments);
  }

  /** Write (or overwrite) a file inside the repo */
  writeFile(relativePath: string, content = ""): void {
    const fullPath = path.join(this.rootPath, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
  }

  /** Append content to a file inside the repo, creating it if needed */
  appendToFile(relativePath: string, content: string): void {
    const fullPath = path.join(this.rootPath, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.appendFileSync(fullPath, content, "utf-8");
  }

  /** Delete a file inside the repo */
  deleteFile(relativePath: string): void {
    fs.rmSync(this.resolve(relativePath));
  }

  /** Remove the entire temp directory */
  cleanup(): void {
    fs.rmSync(this.rootPath, { recursive: true, force: true });
  }
}
