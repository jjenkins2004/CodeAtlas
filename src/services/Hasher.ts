import { createHash } from "crypto";
import fs from "fs/promises";

export interface HasherServicePort {
  /** Returns a SHA-256 hash for arbitrary text content. */
  hashText(content: string): string;
  /** Returns a SHA-256 hash for the contents of a file on disk. */
  hashFile(filePath: string): Promise<string>;
  /** Returns a SHA-256 hash for a code block or snippet of source text. */
  hashCodeBlock(content: string): string;
}

export class HasherService implements HasherServicePort {
  /** Returns a SHA-256 hash for arbitrary text content. */
  hashText(content: string): string {
    return createHash("sha256").update(content, "utf8").digest("hex");
  }

  /** Returns a SHA-256 hash for the contents of a file on disk. */
  async hashFile(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath, "utf8");

    return this.hashText(content);
  }

  /** Returns a SHA-256 hash for a code block or snippet of source text. */
  hashCodeBlock(content: string): string {
    return this.hashText(content);
  }
}

export const hasherService = new HasherService();

/** Returns a SHA-256 hash for arbitrary text content. */
export const hashText = (content: string): string =>
  hasherService.hashText(content);

/** Returns a SHA-256 hash for the contents of a file on disk. */
export const hashFile = (filePath: string): Promise<string> =>
  hasherService.hashFile(filePath);

/** Returns a SHA-256 hash for a code block or snippet of source text. */
export const hashCodeBlock = (content: string): string =>
  hasherService.hashCodeBlock(content);
