import ignore from "ignore";
import fs from "fs";
import path from "path";
import { createLogger } from "./Logger.js";

const logger = createLogger({ component: "ignore-filter" });

/**
 * Hardcoded patterns for non-code files and directories that should
 * never be indexed, regardless of .gitignore contents.
 */
const NON_CODE_PATTERNS = [
  "**/*.xcodeproj/**",
  "**/*.xcodeproj",
  "**/*.bundle/**",
  "**/*.app/**",
  "**/.DS_Store",
  "**/Thumbs.db",
  "**/*.swp",
  "**/*.swo",
  "**/.*",
  "**/*.log",
  "**/node_modules/**",
  "**/.git/**",
  "**/.vscode/**",
  "**/dist/**",
  "**/build/**",
  "**/package-lock.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",
  "**/tsconfig*.json",
  "**/jsconfig*.json",
  "**/*.config.js",
  "**/*.config.ts",
  "**/*.config.mjs",
];

/**
 * Builds and applies ignore filters for a repository, combining .gitignore
 * rules with hardcoded non-code patterns.
 */
export const IgnoreFilter = {
  /**
   * Read and parse .gitignore patterns from a repository root.
   * Returns an empty array if no .gitignore file exists.
   *
   * @param rootPath - Absolute path to the repository root.
   */
  loadGitignorePatterns(rootPath: string): string[] {
    const gitignorePath = path.join(rootPath, ".gitignore");
    const patterns: string[] = [];

    try {
      if (fs.existsSync(gitignorePath)) {
        const content = fs.readFileSync(gitignorePath, "utf-8");
        patterns.push(
          ...content
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith("#")),
        );
      }
    } catch (error) {
      logger.warn({ err: error, gitignorePath }, "Failed to read .gitignore");
    }

    return patterns;
  },

  /**
   * Create an ignore filter for a repository root that combines .gitignore
   * patterns with the hardcoded non-code patterns. Use the returned filter's
   * `.ignores(relativePath)` method to test whether a file should be skipped.
   *
   * @param rootPath - Absolute path to the repository root.
   */
  createFilter(rootPath: string) {
    const ig = ignore();
    const gitignorePatterns = this.loadGitignorePatterns(rootPath);
    ig.add([...NON_CODE_PATTERNS, ...gitignorePatterns]);
    return ig;
  },
};
